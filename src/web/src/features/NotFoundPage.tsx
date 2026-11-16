import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button, Card, EmptyState } from '@/components/ui';

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <EmptyState
          icon={Compass}
          title="Page not found"
          description="The page may have moved, or you may not have access to it."
          action={
            <Button asChild>
              <Link href="/">Back to dashboard</Link>
            </Button>
          }
        />
      </Card>
    </div>
  );
}
