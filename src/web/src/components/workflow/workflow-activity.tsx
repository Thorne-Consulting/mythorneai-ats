'use client';

import Link from 'next/link';
import { useAbility } from '@/lib/ability';

/** What a "WorkflowStep" audit row carries (Features/Workflows/WorkflowActivity.cs). */
type StepDetails = { Title: string; Output?: string | null; Href?: string | null };

function parse(details?: string | null): StepDetails | null {
  try {
    const step = JSON.parse(details ?? '') as StepDetails;
    return step?.Title ? step : null;
  } catch {
    return null;
  }
}

/** "Workflow: Fast lane · Change stage", a link to the run for people who manage workflows. */
export function WorkflowStepTitle({ title, href }: { title: string; href?: string | null }) {
  const ability = useAbility();
  return href && ability.can('manage', 'Workspace') ? (
    <Link href={href} className="hover:text-accent-foreground hover:underline">
      {title}
    </Link>
  ) : (
    <>{title}</>
  );
}

/**
 * For an activity history built from audit rows: a workflow step's title and what it did, or null
 * for any other row. Spread it over the row: `...(workflowStepRow(event) ?? {})`.
 */
export function workflowStepRow(event: { action: string; details?: string | null }) {
  if (event.action !== 'WorkflowStep') return null;
  const step = parse(event.details);
  return step
    ? {
        title: <WorkflowStepTitle title={step.Title} href={step.Href} />,
        body: step.Output ?? null,
      }
    : null;
}
