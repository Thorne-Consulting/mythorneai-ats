import { InterviewsPage } from '@/features/interviews/InterviewsPage';
import { INTERVIEW_VIEWS } from '@/features/interviews/interview-links';

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <InterviewsPage initialView={INTERVIEW_VIEWS.find((item) => item === view)} />;
}
