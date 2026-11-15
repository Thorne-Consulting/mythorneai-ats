import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button, Card, EmptyState } from '@/components/ui';

export default function JobNotFound() {
  return (
    <Card className="mx-auto max-w-xl">
      <EmptyState
        icon={SearchX}
        title="This job is no longer open"
        description="It may have been filled. See the jobs that are still open."
        action={
          <Button asChild>
            <Link href="/careers">See open jobs</Link>
          </Button>
        }
      />
    </Card>
  );
}
