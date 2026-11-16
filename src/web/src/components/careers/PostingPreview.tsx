'use client';

import { PreviewFrame } from './PreviewFrame';

/**
 * The job's public page exactly as applicants see it (the same page as `/careers/{job}`), at
 * desktop or phone width. Works before the job is open: the page then says it is not public yet.
 * For the job's "Job posting" tab.
 */
export function PostingPreview({ jobId }: { jobId: string }) {
  return <PreviewFrame src={`/careers/preview/${jobId}`} title="Preview of the job posting" />;
}
