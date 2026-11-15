'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  HttpTransportType,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr';
import { useHasInbox, useInboxCounts, useRefreshThreads } from './inbox-data';

/**
 * One SignalR connection per tab to /api/hubs/inbox, opened by the first component that needs it.
 * The server pushes ids only ("thread X changed"); we refetch through the normal endpoints.
 *
 * Transports: WebSockets, falling back to long polling. Server-sent events are skipped because a
 * buffering proxy (the Next dev rewrite is one) can hold them back silently. In production route
 * /api/hubs/* straight to the API so WebSockets work.
 */
let connection: HubConnection | null = null;
let starting: Promise<void> | null = null;
const onReconnect = new Set<() => void>();

function hub() {
  if (!connection) {
    connection = new HubConnectionBuilder()
      .withUrl('/api/hubs/inbox', {
        transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
        withCredentials: true,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.None)
      .build();
    connection.onreconnected(() => onReconnect.forEach((fn) => fn()));
  }
  if (connection.state === HubConnectionState.Disconnected && !starting) {
    starting = connection
      .start()
      .catch(() => {
        // Retry quietly; polling in the queries covers the gap.
        setTimeout(() => {
          starting = null;
          hub();
        }, 15_000);
      })
      .then(() => {
        starting = null;
      });
  }
  return connection;
}

async function whenConnected() {
  const c = hub();
  if (starting) await starting;
  return c.state === HubConnectionState.Connected ? c : null;
}

/** Keep inbox and thread queries fresh while mounted. Mount once per screen that shows threads. */
export function useLiveThreads() {
  const refresh = useRefreshThreads();
  const ref = useRef(refresh);
  ref.current = refresh;
  useEffect(() => {
    const c = hub();
    const onChanged = (event: { applicationId: string }) => ref.current(event.applicationId);
    // After a reconnect we may have missed pushes, so refetch everything once.
    const onReconnected = () => ref.current();
    c.on('threadChanged', onChanged);
    onReconnect.add(onReconnected);
    return () => {
      c.off('threadChanged', onChanged);
      onReconnect.delete(onReconnected);
    };
  }, []);
}

/**
 * Who else is typing in this thread, and a `typing()` to call on each keystroke (sent at most
 * every 3 seconds). Also joins the thread's group while mounted.
 */
export function useTyping(applicationId: string) {
  const [typist, setTypist] = useState<string | null>(null);
  const lastSent = useRef(0);
  useEffect(() => {
    let cancelled = false;
    let clear: ReturnType<typeof setTimeout> | undefined;
    const onTyping = (event: { applicationId: string; name: string }) => {
      if (event.applicationId !== applicationId) return;
      setTypist(event.name);
      clearTimeout(clear);
      clear = setTimeout(() => setTypist(null), 5000);
    };
    const c = hub();
    c.on('typing', onTyping);
    const join = () =>
      whenConnected().then(
        (live) => !cancelled && live?.invoke('Watch', applicationId).catch(() => {}),
      );
    join();
    onReconnect.add(join);
    return () => {
      cancelled = true;
      onReconnect.delete(join);
      clearTimeout(clear);
      c.off('typing', onTyping);
      setTypist(null);
      if (c.state === HubConnectionState.Connected)
        c.invoke('Unwatch', applicationId).catch(() => {});
    };
  }, [applicationId]);
  const typing = () => {
    if (Date.now() - lastSent.current < 3000) return;
    lastSent.current = Date.now();
    if (connection?.state === HubConnectionState.Connected)
      connection.invoke('Typing', applicationId).catch(() => {});
  };
  return { typist, typing };
}

/**
 * Unread conversations for the Messages item in the sidebar, kept live. Zero for people without
 * an inbox (interviewers), who never open the connection.
 */
export function useInboxUnread() {
  const has = useHasInbox();
  const counts = useInboxCounts(has);
  const client = useQueryClient();
  useEffect(() => {
    if (!has) return;
    const c = hub();
    const onChanged = () => client.invalidateQueries({ queryKey: ['inbox-counts'] });
    c.on('threadChanged', onChanged);
    onReconnect.add(onChanged);
    return () => {
      c.off('threadChanged', onChanged);
      onReconnect.delete(onChanged);
    };
  }, [has, client]);
  return has ? (counts.data?.unread ?? 0) : 0;
}

/**
 * Run `handler` whenever the server pushes `event` (and once after a reconnect, in case one was
 * missed). Opens the shared connection for anyone signed in, interviewers included.
 */
export function useHubEvent(event: string, handler: () => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const c = hub();
    const run = () => ref.current();
    c.on(event, run);
    onReconnect.add(run);
    return () => {
      c.off(event, run);
      onReconnect.delete(run);
    };
  }, [event, enabled]);
}
