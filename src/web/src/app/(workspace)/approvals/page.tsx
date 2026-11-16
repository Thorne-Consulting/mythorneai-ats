import { ApprovalsPage } from '@/features/approvals/ApprovalsPage';

export default async function Page({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  // Approval emails link to /approvals?open={id}, which opens that approval's details.
  const { open } = await searchParams;
  return <ApprovalsPage openId={open} />;
}
