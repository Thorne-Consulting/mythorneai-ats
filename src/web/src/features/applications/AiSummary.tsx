import { Sparkles } from 'lucide-react';

const HEADINGS = /^(summary|evidence by criterion|open questions)\s*:?$/i;

/** Renders the plain-text AI summary with its headings, labelled as a draft. */
export function AiSummary({ text }: { text: string }) {
  return (
    <section
      aria-label="AI summary, a draft"
      className="mt-4 rounded-lg border border-border bg-card p-4"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
        <Sparkles className="size-3.5 text-tone-violet-dot" aria-hidden />
        AI summary, a draft. Check it against the notes and scorecards.
      </p>
      {text.split('\n').map((raw, index) => {
        const line = raw.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '');
        if (!line.trim()) return null;
        return HEADINGS.test(line.trim()) || /^#/.test(raw) ? (
          <h4 key={index} className="mt-3 text-sm font-semibold text-fg">
            {line.replace(/:$/, '')}
          </h4>
        ) : (
          <p key={index} className="mt-1 text-sm text-fg-muted">
            {line}
          </p>
        );
      })}
    </section>
  );
}
