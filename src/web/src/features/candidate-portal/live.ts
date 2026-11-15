'use client';

import { useEffect, useRef, useState } from 'react';
import {
  HttpTransportType,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr';

/**
 * Live updates for the signed-in candidate: one SignalR connection to /api/hubs/inbox, signed in
 * by the session cookie. The server pushes ids only ("thread X changed"); the portal reloads its
 * data through the normal endpoints.
 */
let connection: HubConnection | null = null;
/** Run after the connection is up, and again after every reconnect. */
const onConnected = new Set<() => void>();

function hub() {
  if (!connection) {
    connection = new HubConnectionBuilder()
      .withUrl('/api/hubs/inbox', {
        // Long polling as the fallback: the Next proxy can hold back server-sent events.
        transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
        withCredentials: true,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.None)
      .build();
    connection.onreconnected(() => onConnected.forEach((fn) => fn()));
  }
  return connection;
}

/** While someone is signed in, call `onChanged` when the team writes, reads or changes a thread. */
export function usePortalLive(signedIn: boolean, onChanged: () => void) {
  const latest = useRef(onChanged);
  latest.current = onChanged;
  useEffect(() => {
    if (!signedIn) return;
    const c = hub();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Several pushes in a row (a message, then its delivery) make one reload.
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(), 300);
    };
    c.on('threadChanged', changed);
    onConnected.add(changed);
    c.start()
      .then(() => onConnected.forEach((fn) => fn !== changed && fn()))
      .catch(() => {});
    return () => {
      clearTimeout(timer);
      onConnected.delete(changed);
      c.off('threadChanged', changed);
      // Signed out, or someone else signs in next: drop the connection and who it belongs to.
      c.stop().catch(() => {});
      connection = null;
    };
  }, [signedIn]);
}

/**
 * Who on the team is typing in this thread, and a `typing()` to call on each keystroke (sent at
 * most every 3 seconds). Joins the thread while mounted.
 */
export function useThreadTyping(applicationId: string) {
  const [typist, setTypist] = useState<string | null>(null);
  const lastSent = useRef(0);
  useEffect(() => {
    const c = hub();
    let clear: ReturnType<typeof setTimeout> | undefined;
    const onTyping = (event: { applicationId: string; name: string; fromCandidate: boolean }) => {
      if (event.applicationId !== applicationId || event.fromCandidate) return;
      setTypist(event.name);
      clearTimeout(clear);
      clear = setTimeout(() => setTypist(null), 5000);
    };
    const watch = () => {
      if (c.state === HubConnectionState.Connected)
        c.invoke('Watch', applicationId).catch(() => {});
    };
    c.on('typing', onTyping);
    onConnected.add(watch);
    watch();
    return () => {
      clearTimeout(clear);
      onConnected.delete(watch);
      c.off('typing', onTyping);
      if (c.state === HubConnectionState.Connected)
        c.invoke('Unwatch', applicationId).catch(() => {});
    };
  }, [applicationId]);
  return {
    typist,
    typing: () => {
      if (Date.now() - lastSent.current < 3000) return;
      lastSent.current = Date.now();
      if (connection?.state === HubConnectionState.Connected)
        connection.invoke('Typing', applicationId).catch(() => {});
    },
  };
}
