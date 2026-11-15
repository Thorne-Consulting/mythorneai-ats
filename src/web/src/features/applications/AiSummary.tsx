import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

const HEADINGS =
  /^(summary|overview|evidence by criterion|evidence by question|open questions|questions the candidate asked|open questions for the next round)\s*:?$/i;
const STAMP = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;

const seconds = (stamp: string) =>
  stamp.split(':').reduce((total, part) => total * 60 + Number(part), 0);

/** **bold** and [12:34] links to that moment of the recording. */
function inline(text: string, timeHref?: (seconds: number) => string) {
  const out: ReactNode[] = [];
  text.split(/(\*\*[^*]+\*\*)/).forEach((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      out.push(
        <strong key={`b${i}`} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>,
      );
      return;
    }
    let last = 0;
    for (const match of part.matchAll(STAMP)) {
      out.push(<Fragment key={`t${i}-${last}`}>{part.slice(last, match.index)}</Fragment>);
      out.push(
        timeHref ? (
          <Link
            key={`s${i}-${match.index}`}
            href={timeHref(seconds(match[1]))}
            className="rounded-sm px-0.5 font-medium text-accent-foreground tnum hover:underline"
          >
            {match[1]}
          </Link>
        ) : (
          <span key={`s${i}-${match.index}`} className="tnum">
            [{match[1]}]
          </span>
        ),
      );
      last = match.index! + match[0].length;
    }
    out.push(<Fragment key={`e${i}`}>{part.slice(last)}</Fragment>);
  });
  return out;
}

/**
 * Renders an AI summary (plain text or simple Markdown) with its headings, labelled as AI. With
 * `timeHref`, times like [12:34] link to that moment of the recording.
 */
export function AiSummary({
  text,
  timeHref,
  note = 'AI summary, a draft. Check it against the notes and scorecards.',
}: {
  text: string;
  timeHref?: (seconds: number) => string;
  note?: ReactNode;
}) {
  return (
    <section aria-label="AI summary" className="mt-4 rounded-lg border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
        <Sparkles className="size-3.5 text-tone-violet-dot" aria-hidden />
        {note}
      </p>
      {text.split('\n').map((raw, index) => {
        const line = raw.replace(/^#{1,6}\s*/, '');
        if (!line.trim()) return null;
        const bullet = /^\s*[-*]\s+/.test(line);
        if (HEADINGS.test(line.replace(/\*\*/g, '').trim()) || /^#/.test(raw))
          return (
            <h4 key={index} className="mt-4 text-sm font-semibold text-fg first-of-type:mt-3">
              {line.replace(/\*\*/g, '').replace(/:$/, '')}
            </h4>
          );
        return bullet ? (
          <p key={index} className="mt-1 flex gap-2 pl-1 text-sm text-fg-muted">
            <span aria-hidden>•</span>
            <span>{inline(line.replace(/^\s*[-*]\s+/, ''), timeHref)}</span>
          </p>
        ) : (
          <p key={index} className="mt-1 text-sm text-fg-muted">
            {inline(line, timeHref)}
          </p>
        );
      })}
    </section>
  );
}
