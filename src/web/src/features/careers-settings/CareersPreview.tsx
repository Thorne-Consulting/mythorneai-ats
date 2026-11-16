'use client';

import { useEffect, useRef, useState } from 'react';
import { SegmentedControl } from '@/components/ui';
import { PreviewFrame } from '@/components/careers/PreviewFrame';
import type { PublicBrand } from '@/features/careers/brand';
import type { PreviewMessage } from '@/features/careers/PublicFrame';

/**
 * The real careers page or portal in a frame, at desktop or phone width. The brand being edited
 * is posted into the frame, so the preview changes as you type.
 */
export function CareersPreview({ company, brand }: { company: string; brand: PublicBrand }) {
  const [page, setPage] = useState<'careers' | 'portal'>('careers');
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef<PreviewMessage>({ type: 'careers-preview', company, brand });
  latest.current = { type: 'careers-preview', company, brand };
  const send = () =>
    frame.current?.contentWindow?.postMessage(latest.current, window.location.origin);

  // The frame asks for the brand once it has loaded; after that, every edit is sent.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'careers-preview-ready')
        send();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(send, [company, brand]);

  return (
    <PreviewFrame
      src={page === 'careers' ? '/careers?preview=1' : '/candidate-portal?preview=1'}
      title={page === 'careers' ? 'Preview of the careers page' : 'Preview of the candidate portal'}
      frameRef={frame}
      onLoad={send}
      toolbar={
        <SegmentedControl
          size="sm"
          aria-label="Page to preview"
          value={page}
          onValueChange={(v) => setPage(v as 'careers' | 'portal')}
          items={[
            { value: 'careers', label: 'Careers page' },
            { value: 'portal', label: 'Candidate portal' },
          ]}
        />
      }
    />
  );
}
