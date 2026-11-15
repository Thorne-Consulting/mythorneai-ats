import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader } from '@/components/ui';

/**
 * /pipeline opens a job's Pipeline tab (the last job you viewed, or the first open one). This is
 * what shows when there is no job to open.
 */
export function PipelinePage({ canCreate }: { canCreate: boolean }) {
  return (
    <>
      <PageHeader title="Pipeline" />
      <Card>
        <EmptyState
          icon={Briefcase}
          title="No open jobs"
          description="Open a job to see its candidates by stage here."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="secondary">
                <Link href="/jobs">Go to jobs</Link>
              </Button>
              {canCreate && (
                <Button asChild>
                  <Link href="/jobs/new">Create job</Link>
                </Button>
              )}
            </div>
          }
        />
      </Card>
    </>
  );
}
