import * as React from 'react';

import type { TCodeBlockElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';

import { SlateElement } from 'platejs/static';

// ponytail: no syntax colours. CodeBlockPlugin takes a lowlight option if anyone ever needs them.
export const codeBlockClass = 'my-3 overflow-hidden rounded-md bg-muted text-fg';
export const codeClass =
  'overflow-x-auto px-4 py-3 font-mono text-sm leading-relaxed whitespace-pre';

/** The languages offered in the editor, stored as the Markdown fence's word (```python). */
export const CODE_LANGUAGES: [string, string][] = [
  ['bash', 'Shell'],
  ['csharp', 'C#'],
  ['css', 'CSS'],
  ['go', 'Go'],
  ['html', 'HTML'],
  ['java', 'Java'],
  ['javascript', 'JavaScript'],
  ['json', 'JSON'],
  ['kotlin', 'Kotlin'],
  ['php', 'PHP'],
  ['python', 'Python'],
  ['ruby', 'Ruby'],
  ['rust', 'Rust'],
  ['sql', 'SQL'],
  ['swift', 'Swift'],
  ['typescript', 'TypeScript'],
  ['yaml', 'YAML'],
];

const ALIASES: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  cs: 'csharp',
  js: 'javascript',
  py: 'python',
  rb: 'ruby',
  ts: 'typescript',
  yml: 'yaml',
};

/** "ts" and "typescript" both read "TypeScript"; an unknown word shows as written. */
export function codeLanguageLabel(lang?: string | null) {
  if (!lang) return null;
  const key = ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();
  return CODE_LANGUAGES.find(([value]) => value === key)?.[1] ?? lang;
}

export function CodeBlockElementStatic(props: SlateElementProps<TCodeBlockElement>) {
  const label = codeLanguageLabel(props.element.lang);
  return (
    <SlateElement {...props} className={codeBlockClass}>
      {label && <div className="px-4 pt-2 text-2xs font-medium text-fg-subtle">{label}</div>}
      <pre className={codeClass}>
        <code>{props.children}</code>
      </pre>
    </SlateElement>
  );
}

export function CodeLineElementStatic(props: SlateElementProps) {
  return <SlateElement {...props} />;
}
