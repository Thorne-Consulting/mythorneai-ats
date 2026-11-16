import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui';

/** One card in the record rail: a small title, an optional action, and the facts. */
export function RailGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} action={action} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export function Missing({ children = 'Not provided' }: { children?: ReactNode }) {
  return <span className="text-fg-subtle">{children}</span>;
}
