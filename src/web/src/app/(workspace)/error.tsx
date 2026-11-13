'use client';

import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button, Card, EmptyState } from '@/components/ui';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="Could not load this page"
        description="Something went wrong while loading this screen. Your changes were not lost."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" asChild>
              <Link href="/">Back to dashboard</Link>
            </Button>
            <Button leftIcon={<RotateCcw />} onClick={reset}>
              Try again
            </Button>
          </div>
        }
      />
    </Card>
  );
}
