import { AssessmentsProvider } from '@/features/preview/assessments/store';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AssessmentsProvider>{children}</AssessmentsProvider>;
}
