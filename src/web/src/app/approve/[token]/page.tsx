import type { Metadata } from 'next';
import { ApprovalLinkPage } from '@/features/approvals/ApprovalLinkPage';

// Opened from an approval email. The link itself is the sign-in, so it is never indexed.
export const metadata: Metadata = {
  title: 'Approval request',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ApprovalLinkPage token={token} />;
}
