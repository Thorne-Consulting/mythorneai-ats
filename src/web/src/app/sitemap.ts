import type { MetadataRoute } from 'next';
import { jobPath } from '@/features/careers/jobs';
import { getJobs, siteOrigin } from '@/features/careers/server';

// Search engines find every open job here. Only the public careers pages are listed.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  const jobs = await getJobs({}, 200).catch(() => null);
  const items = jobs?.items ?? [];
  return [
    {
      url: `${origin}/careers`,
      lastModified: items[0]?.postedAt ? new Date(items[0].postedAt) : undefined,
      changeFrequency: 'daily',
    },
    ...items.map((job) => ({
      url: `${origin}${jobPath(job)}`,
      lastModified: new Date(job.updatedAt),
      changeFrequency: 'weekly' as const,
    })),
  ];
}
