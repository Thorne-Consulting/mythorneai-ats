import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Gallery } from '@/features/design-system/Gallery';

export const metadata: Metadata = { title: 'UI Library' };

/** Living component gallery. Development only; production builds return 404. */
export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Gallery />;
}
