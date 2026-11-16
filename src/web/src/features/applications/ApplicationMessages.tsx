'use client';

import { useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui';
import { useLiveThreads } from '@/features/messages/live';
import { Thread, type ThreadHandle } from '@/features/messages/Thread';
import { useAbility } from '@/lib/ability';
import { useHotkeys } from '@/lib/hooks';
import { useApplication } from './application-data';

/**
 * The application's Messages tab: the same thread as the inbox, without the header (the record
 * header already names the person) and without the details rail (the record has its own).
 */
export function ApplicationMessagesTab({ id }: { id: string }) {
  const ability = useAbility();
  // `canManage` is the server's answer for this application's job (CanManage), the same rule
  // `can('update', asJob(job))` reads; the record header already loaded it.
  const manages = useApplication(id).data?.canManage;
  if (manages === undefined) return null;
  if (!ability.can('read', 'Message') || !manages)
    return (
      <Card>
        <EmptyState
          icon={MessageSquare}
          title="Messages are for the hiring team"
          description="Ask the job’s recruiter if you need to see what was said."
        />
      </Card>
    );
  return <ManagedThread id={id} />;
}

function ManagedThread({ id }: { id: string }) {
  useLiveThreads();
  const thread = useRef<ThreadHandle>(null);
  useHotkeys([['r', () => thread.current?.focus()]]);
  return (
    // Fills the screen under the record header, so the composer is always in view.
    <Card className="flex h-[75dvh] min-h-[420px] flex-col overflow-hidden lg:h-[calc(100dvh-24rem)]">
      <Thread ref={thread} applicationId={id} header={false} />
    </Card>
  );
}
