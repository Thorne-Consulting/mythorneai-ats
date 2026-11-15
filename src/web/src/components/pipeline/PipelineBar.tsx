import { Tooltip, toneDot } from '@/components/ui';
import { stageTone } from '@/components/status';
import { cn } from '@/lib/cn';

/**
 * Where a job's active candidates sit, left to right through its stages, one segment per stage
 * in the stage's colour. Used on the jobs list and the dashboard's open jobs.
 */
export function PipelineBar({
  stages,
  className,
}: {
  stages: Array<{ name: string; count: number; type?: string; color?: string | null }>;
  className?: string;
}) {
  const label = stages.map((stage) => `${stage.name} ${stage.count}`).join(', ');
  return (
    <span
      role="img"
      aria-label={`Candidates by stage: ${label}`}
      className={cn('flex h-2 gap-0.5 overflow-hidden rounded-full bg-secondary', className)}
    >
      {stages.map((stage) =>
        stage.count === 0 ? null : (
          <Tooltip key={stage.name} label={`${stage.name}: ${stage.count}`}>
            <span
              className={cn('h-full', toneDot(stageTone(stage.type, stage.color)))}
              // Dynamic share of the bar.
              style={{ flexGrow: stage.count }}
            />
          </Tooltip>
        ),
      )}
    </span>
  );
}
