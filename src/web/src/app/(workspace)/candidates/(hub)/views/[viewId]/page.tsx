import { savedViewPage } from '@/features/candidates/list-route';

export default async function Page({ params }: { params: Promise<{ viewId: string }> }) {
  const { viewId } = await params;
  return savedViewPage(viewId);
}
