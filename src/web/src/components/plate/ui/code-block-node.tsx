'use client';

import * as React from 'react';

import type { TCodeBlockElement } from 'platejs';

import { type PlateElementProps, PlateElement, useReadOnly } from 'platejs/react';

import {
  CODE_LANGUAGES,
  codeBlockClass,
  codeClass,
  codeLanguageLabel,
} from './code-block-node-static';

/** A code block with its language at the top: a menu while editing, a label when reading. */
export function CodeBlockElement(props: PlateElementProps<TCodeBlockElement>) {
  const { editor, element } = props;
  const readOnly = useReadOnly();
  const lang = element.lang ?? '';
  const label = codeLanguageLabel(lang);
  const known = CODE_LANGUAGES.some(([value]) => value === lang);
  return (
    <PlateElement {...props} className={codeBlockClass}>
      <div contentEditable={false} className="flex items-center px-4 pt-2 select-none">
        {readOnly ? (
          label && <span className="text-2xs font-medium text-fg-subtle">{label}</span>
        ) : (
          <select
            aria-label="Code language"
            value={lang}
            onChange={(event) => {
              const path = editor.api.findPath(element);
              if (path) editor.tf.setNodes({ lang: event.target.value || undefined }, { at: path });
            }}
            className="-ml-1 h-6 cursor-pointer rounded bg-transparent px-1 text-2xs font-medium text-fg-subtle hover:bg-accent hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">Plain text</option>
            {!known && lang && <option value={lang}>{label}</option>}
            {CODE_LANGUAGES.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>
      <pre className={codeClass}>
        <code>{props.children}</code>
      </pre>
    </PlateElement>
  );
}

export function CodeLineElement(props: PlateElementProps) {
  return <PlateElement {...props} />;
}
