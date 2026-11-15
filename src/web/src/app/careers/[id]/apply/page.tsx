import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApplyForm } from '@/features/careers/ApplyForm';
import { idFromParam } from '@/features/careers/jobs';
import { getJob, getOrganization } from '@/features/careers/server';

type Props = { params: Promise<{ id: string }> };

const load = async (param: string) => {
  const id = idFromParam(param);
  return id ? getJob(id) : null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await load((await params).id);
  return {
    title: job ? `Apply for ${job.title}` : 'Job not found',
    robots: { index: false },
  };
}

export default async function Page({ params }: Props) {
  const job = await load((await params).id);
  if (!job) notFound();
  const { brand } = await getOrganization();
  return <ApplyForm job={job} requireResume={!!brand?.requireResume} />;
}
