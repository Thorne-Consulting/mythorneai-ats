import { ApplicationFrame } from '@/features/candidate-portal/ApplicationFrame';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ApplicationFrame id={id}>{children}</ApplicationFrame>;
}
