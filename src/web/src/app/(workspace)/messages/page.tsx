import { Suspense } from 'react';
import { InboxPage } from '@/features/messages/InboxPage';

export default function Page() {
  return (
    <Suspense>
      <InboxPage />
    </Suspense>
  );
}
