'use client';

import { PageHeader } from '@/components/ui';
import { RichText } from '@/components/rich-text';
import { useBrand } from './PublicFrame';

/**
 * The top of the careers board: the employer's headline and introduction from the careers
 * settings, or a plain "Open jobs" title when they have not written one.
 */
export function CareersHero() {
  const { company, brand } = useBrand();
  const intro = brand.introMarkdown?.trim();
  if (!brand.headline && !intro) return <PageHeader title="Open jobs" />;
  return (
    <>
      <section className="mb-10 max-w-3xl">
        <h1 className="text-3xl font-bold text-balance text-fg">
          {brand.headline || `Work at ${company || 'our company'}`}
        </h1>
        {intro && <RichText markdown={intro} className="mt-3 text-md text-fg-muted" />}
      </section>
      <h2 className="mb-4 text-xl font-semibold text-fg">Open jobs</h2>
    </>
  );
}
