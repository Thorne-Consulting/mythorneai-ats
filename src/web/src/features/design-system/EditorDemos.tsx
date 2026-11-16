'use client';

import { useState } from 'react';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { type ChipSets, DocumentEditor } from '@/components/plate/document-editor';
import { RichText } from '@/components/rich-text';

const sample = `## About the role

You will own **hiring tools** end to end and work closely with [our design team](https://example.com).

- Ship something every week
- Pair with recruiters
  - Sit in on a hiring loop

1. Apply
2. Meet the team

- [x] Portfolio reviewed
- [ ] Reference call

> We read every application.

| Stage | Length |
| --- | --- |
| Screen | 30 minutes |
| Onsite | 3 hours |

Hi {{firstName}}, [Avery Admin](mention:avery%40example.test) will be in touch.

![The MyThorneAI logo](/brand/mark.png?size=88x88)

\`\`\`python
def fizzbuzz(n):
    return "Fizz" * (n % 3 == 0) + "Buzz" * (n % 5 == 0) or str(n)
\`\`\`
`;

const chips: ChipSets = {
  details: [
    { key: 'firstName', text: 'First name', group: 'Candidate' },
    { key: 'lastName', text: 'Last name', group: 'Candidate' },
    { key: 'jobTitle', text: 'Job title', group: 'Job' },
    { key: 'companyName', text: 'Company name', group: 'Job' },
  ],
  people: [
    { key: 'avery@example.test', text: 'Avery Admin' },
    { key: 'jordan@example.test', text: 'Jordan Lee' },
  ],
};

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-2.5 text-xs text-fg-muted">{label}</p>
      {children}
    </div>
  );
}

/** Both editors and the read-only renderer, all on the one shared kit. */
export function EditorDemos() {
  const [field, setField] = useState(sample);
  const [doc, setDoc] = useState(sample);
  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        <Pane label="PlateMarkdownEditor · type - , 1. , [] , **bold**, ``` for code, : for emoji, @ for people, { for details. Paste, drop or use the picture button for pictures">
          <PlateMarkdownEditor value={field} onChange={setField} chips={chips} />
        </Pane>
        <Pane label="RichText · what readers see (works in server components)">
          <div className="rounded-md border border-border-subtle px-5 py-4">
            <RichText markdown={field} className="text-md" />
          </div>
        </Pane>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Pane label="DocumentEditor · / for a block (code block and picture among them), select text for the format bar">
          <div className="rounded-md border border-border-subtle px-5 py-4 [&_.plate-ui_[data-slate-editor]]:min-h-80">
            <DocumentEditor value={doc} onChange={setDoc} chips={chips} />
          </div>
        </Pane>
        <Pane label="The Markdown it saves">
          <pre className="max-h-[520px] overflow-auto rounded-md bg-muted px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg">
            {doc}
          </pre>
        </Pane>
      </div>
    </>
  );
}
