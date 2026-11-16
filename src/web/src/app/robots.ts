import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/features/careers/server';

// Only the careers site is for search engines. The candidate portal and the workspace are private.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();
  return {
    rules: {
      userAgent: '*',
      allow: ['/careers', '/_next/'],
      disallow: ['/'],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
