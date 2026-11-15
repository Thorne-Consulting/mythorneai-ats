'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api } from '@/api';
import { toast } from '@/components/ui';
import { useAbility } from '@/lib/ability';
import { uniqueThreads } from './inbox-format';

export { formatSize, listTime, plainPreview, timePresets, whenText } from './inbox-format';

export const folders = [
  'inbox',
  'assigned',
  'unassigned',
  'unread',
  'starred',
  'awaiting-reply',
  'scheduled',
  'snoozed',
  'done',
] as const;
export type Folder = (typeof folders)[number];
export type InboxView = Folder | 'unmatched';

export const folderInfo: Record<InboxView, { label: string; empty: string; emptyHint: string }> = {
  inbox: {
    label: 'Inbox',
    empty: 'No open conversations',
    emptyHint: 'Start one with New message. Candidate replies show up here.',
  },
  assigned: {
    label: 'Assigned to me',
    empty: 'Nothing assigned to you',
    emptyHint: 'Conversations you reply to or are given show up here.',
  },
  unassigned: {
    label: 'Unassigned',
    empty: 'Every conversation has an owner',
    emptyHint: 'New conversations nobody has answered yet show up here.',
  },
  unread: {
    label: 'Unread',
    empty: 'You’re all caught up',
    emptyHint: 'New replies from candidates show up here.',
  },
  starred: {
    label: 'Starred',
    empty: 'No starred conversations',
    emptyHint: 'Star a conversation (press s) to keep it here.',
  },
  'awaiting-reply': {
    label: 'Awaiting reply',
    empty: 'Nobody owes you a reply',
    emptyHint: 'Conversations where you wrote last show up here.',
  },
  scheduled: {
    label: 'Scheduled',
    empty: 'No messages waiting to go',
    emptyHint: 'Messages you schedule for later wait here until they are sent.',
  },
  snoozed: {
    label: 'Snoozed',
    empty: 'Nothing snoozed',
    emptyHint: 'Snooze a conversation (press h) to bring it back at a better time.',
  },
  done: {
    label: 'Done',
    empty: 'Nothing marked done',
    emptyHint: 'Mark a conversation done (press e) when nothing is left to do.',
  },
  unmatched: {
    label: 'Unmatched email',
    empty: 'No unmatched email',
    emptyHint: 'Emails we can’t match to a candidate wait here for you to sort.',
  },
};

export interface InboxRow {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  requisitionId: string;
  jobTitle: string;
  stage: string;
  status: string;
  lastAt: string;
  preview: string;
  lastFromCandidate: boolean;
  lastChannel: 'Portal' | 'Email';
  lastAuthorEmail?: string | null;
  unread: boolean;
  starred: boolean;
  done: boolean;
  hasFiles: boolean;
  assigneeEmail?: string | null;
  assigneeName?: string | null;
  snoozedUntil?: string | null;
  scheduledFor?: string | null;
  /** With a search: the newest matching message, its words wrapped in <mark>. */
  matchMessageId?: string | null;
  snippet?: string | null;
}
type InboxPage = { items: InboxRow[]; nextCursor: number | null };

export interface MessageFile {
  id: string;
  name: string;
  size: number;
  contentType: string;
}

export type Delivery = 'sending' | 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed';

export interface ThreadMessage {
  id: string;
  fromCandidate: boolean;
  body: string;
  originalBody?: string | null;
  channel: 'Portal' | 'Email';
  authorEmail?: string | null;
  authorName?: string | null;
  fromAddress?: string | null;
  createdAt: string;
  readAt?: string | null;
  delivery?: Delivery | null;
  deliveryError?: string | null;
  /** Still waiting to go out at this time (a scheduled message). */
  scheduledFor?: string | null;
  attachments: MessageFile[];
}

export interface ThreadInfo {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateFirstName: string;
  candidateEmail: string;
  requisitionId: string;
  jobTitle: string;
  stage?: string | null;
  status: string;
  starred: boolean;
  done: boolean;
  unread: boolean;
  blockedReason?: string | null;
  emailBounced: boolean;
  replyByEmail: boolean;
  assigneeEmail?: string | null;
  assigneeName?: string | null;
  snoozedUntil?: string | null;
  otherApplications: {
    applicationId: string;
    jobTitle: string;
    stage: string;
    stageType?: string | null;
    stageColor?: string | null;
    status: string;
  }[];
}
type ThreadPage = { thread: ThreadInfo; messages: ThreadMessage[]; hasMore: boolean };

export interface UnmatchedEmail {
  id: string;
  fromAddress: string;
  fromName?: string | null;
  subject: string;
  body: string;
  receivedAt: string;
}

export interface Recipient {
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  stage: string;
}

/** Only people who work on jobs have an inbox (interviewers do not). */
export const useHasInbox = () => useAbility().can('read', 'Message');

export function useInbox(folder: Folder, q: string) {
  return useInfiniteQuery({
    queryKey: ['inbox', folder, q],
    queryFn: ({ pageParam }) =>
      api.get<InboxPage>(
        `/api/inbox?folder=${folder}&cursor=${pageParam}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Live updates refetch; this covers a lost connection.
    refetchInterval: 60_000,
  });
}

/** Rows across loaded pages; a thread that moved up while paging appears once. */
export const flattenInbox = (data: InfiniteData<InboxPage> | undefined) =>
  uniqueThreads((data?.pages ?? []).flatMap((p) => p.items));

export function useInboxCounts(enabled = true) {
  return useQuery({
    queryKey: ['inbox-counts'],
    queryFn: () =>
      api.get<{ unread: number; assigned: number; unmatched: number }>('/api/inbox/counts'),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useThread(applicationId: string | null) {
  return useInfiniteQuery({
    queryKey: ['thread', applicationId],
    queryFn: ({ pageParam }) =>
      api.get<ThreadPage>(
        `/api/applications/${applicationId}/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.createdAt : undefined),
    enabled: !!applicationId,
  });
}

/** Oldest first, across every loaded page. */
export const threadMessages = (data: InfiniteData<ThreadPage> | undefined) =>
  [...(data?.pages ?? [])].reverse().flatMap((p) => p.messages);

/** Everything that shows a thread or its counts, refreshed together. */
export function useRefreshThreads() {
  const client = useQueryClient();
  return (applicationId?: string) => {
    client.invalidateQueries({ queryKey: ['inbox'] });
    client.invalidateQueries({ queryKey: ['inbox-counts'] });
    if (applicationId) {
      client.invalidateQueries({ queryKey: ['thread', applicationId] });
      // The application record counts unread messages on its Messages tab.
      client.invalidateQueries({ queryKey: ['application', applicationId] });
    } else client.invalidateQueries({ queryKey: ['thread'] });
  };
}

export type ThreadChange = {
  starred?: boolean;
  done?: boolean;
  unread?: boolean;
  /** An email to assign, or "" to unassign. */
  assignee?: string;
  snoozeUntil?: string;
  unsnooze?: boolean;
};

export function useThreadActions(applicationId: string) {
  const refresh = useRefreshThreads();
  const patch = useMutation({
    mutationFn: (change: ThreadChange) =>
      api.patch(`/api/applications/${applicationId}/thread`, change),
    onSettled: () => refresh(applicationId),
    onError: (error: Error) => toast.error('Could not update the conversation', error.message),
  });
  const markRead = useMutation({
    mutationFn: () => api.post(`/api/applications/${applicationId}/messages/read`),
    onSuccess: () => refresh(applicationId),
  });
  return { patch, markRead };
}

export function useSendMessage(applicationId: string) {
  const refresh = useRefreshThreads();
  return useMutation({
    mutationFn: (input: { body: string; attachmentIds: string[]; scheduledFor?: string }) =>
      api.post<{ id: string; scheduledFor?: string | null }>(
        `/api/applications/${applicationId}/messages`,
        input,
      ),
    onSuccess: () => refresh(applicationId),
  });
}

/** Take back a message whose email has not gone yet (Undo, or cancel a scheduled one). */
export const unsendMessage = (id: string) =>
  api.delete<{ body: string; attachments: MessageFile[] }>(`/api/messages/${id}`);

/** Teammates who may own this conversation. */
export function useAssignees(applicationId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['thread-assignees', applicationId],
    queryFn: () =>
      api.get<{ email: string; name: string }[]>(
        `/api/applications/${applicationId}/thread/assignees`,
      ),
    enabled: !!applicationId && enabled,
    staleTime: 5 * 60_000,
  });
}

export function useUnmatched(enabled: boolean) {
  return useQuery({
    queryKey: ['inbox-unmatched'],
    queryFn: () => api.get<UnmatchedEmail[]>('/api/inbox/unmatched'),
    enabled,
  });
}
