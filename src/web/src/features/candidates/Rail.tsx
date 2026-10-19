import type { ReactNode } from 'react';

/** A titled group of facts in the record rail. The title is small; the facts carry the weight. */
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
    <section className="rail-group">
      <div className="rail-head">
        <h3 className="rail-title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One label / value row. Put it inside a <dl className="facts-grid rail-facts">. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function Missing({ children = 'Not provided' }: { children?: ReactNode }) {
  return <span className="rail-missing">{children}</span>;
}
