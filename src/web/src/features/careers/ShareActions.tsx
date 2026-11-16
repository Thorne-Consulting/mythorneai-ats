'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Link2, Share2 } from 'lucide-react';
import { Button, IconButton, toast } from '@/components/ui';

function useShare(title: string) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link', 'Copy it from the address bar instead.');
    }
  }
  const share = () => navigator.share({ title, url: window.location.href }).catch(() => {});
  return { canShare, copy, share };
}

/** Desktop rail: apply, then copy link and share. */
export function ApplyCard({
  title,
  applyHref,
  posted,
}: {
  title: string;
  applyHref: string;
  posted?: string | null;
}) {
  const { canShare, copy, share } = useShare(title);
  return (
    <div className="space-y-3">
      <Button asChild size="lg" fullWidth>
        <Link href={applyHref}>Apply for this job</Link>
      </Button>
      <p className="text-center text-sm text-fg-subtle">
        {posted ? `${posted} · ` : ''}Takes about 3 minutes.
      </p>
      <div className="flex gap-2 border-t border-border-subtle pt-3">
        <Button variant="quiet" size="sm" leftIcon={<Link2 />} onClick={copy} className="flex-1">
          Copy link
        </Button>
        {canShare && (
          <Button
            variant="quiet"
            size="sm"
            leftIcon={<Share2 />}
            onClick={share}
            className="flex-1"
          >
            Share
          </Button>
        )}
      </div>
    </div>
  );
}

/** Phone: apply and share stay in reach while reading. */
export function ApplyBar({ title, applyHref }: { title: string; applyHref: string }) {
  const { canShare, copy, share } = useShare(title);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border-subtle bg-card px-4 py-3 shadow-pop lg:hidden">
      <Button asChild size="lg" className="flex-1">
        <Link href={applyHref}>Apply for this job</Link>
      </Button>
      {canShare ? (
        <IconButton size="lg" variant="secondary" label="Share this job" onClick={share}>
          <Share2 />
        </IconButton>
      ) : (
        <IconButton size="lg" variant="secondary" label="Copy link to this job" onClick={copy}>
          <Link2 />
        </IconButton>
      )}
    </div>
  );
}
