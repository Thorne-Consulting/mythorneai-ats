'use client';

import { useMemo } from 'react';
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Colours come from the design tokens, so the editor follows light and dark mode with the app.
const tokenTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--card)', color: 'var(--foreground)', fontSize: '13px' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  '.cm-content': { caretColor: 'var(--foreground)' },
  '.cm-gutters': {
    backgroundColor: 'var(--muted)',
    color: 'var(--fg-subtle)',
    borderRight: '1px solid var(--border-subtle)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '&.cm-focused .cm-activeLine': { backgroundColor: 'var(--muted)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '&.cm-focused .cm-activeLineGutter': {
    backgroundColor: 'var(--accent)',
    color: 'var(--foreground)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--accent)' },
  '.cm-placeholder': { color: 'var(--fg-subtle)' },
});

const highlight = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword],
      color: 'var(--tone-violet-fg)',
    },
    { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--tone-green-fg)' },
    { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--tone-amber-fg)' },
    {
      tag: [t.comment, t.lineComment, t.blockComment],
      color: 'var(--fg-subtle)',
      fontStyle: 'italic',
    },
    {
      tag: [t.function(t.variableName), t.function(t.propertyName), t.typeName, t.className],
      color: 'var(--tone-blue-fg)',
    },
    { tag: [t.propertyName, t.attributeName], color: 'var(--fg-muted)' },
  ]),
);

/** A small C-family highlighter for Java, C# and Go: keywords, strings, numbers, comments. */
function cLike(words: string) {
  const keywords = new Set(words.split(' '));
  return StreamLanguage.define<{ comment: boolean }>({
    startState: () => ({ comment: false }),
    token(stream, state) {
      if (state.comment) {
        if (stream.skipTo('*/')) {
          stream.match('*/');
          state.comment = false;
        } else stream.skipToEnd();
        return 'comment';
      }
      if (stream.eatSpace()) return null;
      if (stream.match('//')) {
        stream.skipToEnd();
        return 'comment';
      }
      if (stream.match('/*')) {
        state.comment = true;
        return 'comment';
      }
      if (
        stream.match(/^"(?:[^"\\]|\\.)*"?/) ||
        stream.match(/^'(?:[^'\\]|\\.)*'?/) ||
        stream.match(/^`[^`]*`?/)
      )
        return 'string';
      if (stream.match(/^\d[\w.]*/)) return 'number';
      if (stream.match(/^[A-Za-z_]\w*/)) {
        const word = stream.current();
        if (keywords.has(word)) return 'keyword';
        return /^[A-Z]/.test(word) ? 'typeName' : null;
      }
      stream.next();
      return null;
    },
  });
}

const java = cLike(
  'abstract boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws try void while var true false record',
);
const csharp = cLike(
  'abstract as async await base bool break byte case catch char class const continue decimal default do double else enum event false finally float for foreach if in int interface internal is long namespace new null object out override params private protected public readonly record ref return sealed short static string struct switch this throw true try using var virtual void while',
);
const go = cLike(
  'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil string int bool error byte rune float64',
);

function languageFor(language: string): Extension[] {
  switch (language) {
    case 'JavaScript':
      return [javascript({ jsx: true })];
    case 'TypeScript':
      return [javascript({ typescript: true })];
    case 'Python':
      return [python()];
    case 'SQL':
      return [sql()];
    case 'Java':
      return [java];
    case 'C#':
      return [csharp];
    case 'Go':
      return [go];
    default:
      return [];
  }
}

export type CodeMirrorFieldProps = {
  value: string;
  onChange?: (value: string) => void;
  language: string;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  /** Called on paste; call `preventDefault()` to stop it. */
  onPaste?: (event: ClipboardEvent) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  'aria-label': string;
  placeholder?: string;
};

export default function CodeMirrorField({
  value,
  onChange,
  language,
  readOnly,
  minHeight = '160px',
  maxHeight = '520px',
  onPaste,
  onFocus,
  onBlur,
  placeholder,
  'aria-label': ariaLabel,
}: CodeMirrorFieldProps) {
  const extensions = useMemo(
    () => [
      ...languageFor(language),
      highlight,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
      EditorView.domEventHandlers({
        paste: (event) => {
          onPaste?.(event);
          return event.defaultPrevented;
        },
        focus: () => onFocus?.(),
        blur: () => onBlur?.(),
      }),
    ],
    [language, ariaLabel, onPaste, onFocus, onBlur],
  );
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={tokenTheme}
      extensions={extensions}
      readOnly={readOnly}
      editable={!readOnly}
      minHeight={minHeight}
      maxHeight={maxHeight}
      placeholder={placeholder}
      // Heights are measured once on mount; measure again after layout and web fonts settle,
      // or line numbers drift from their lines.
      onCreateEditor={(view) => {
        requestAnimationFrame(() => view.requestMeasure());
        setTimeout(() => view.requestMeasure(), 300);
        document.fonts?.ready.then(() => view.requestMeasure());
      }}
      basicSetup={{
        foldGutter: false,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
        autocompletion: false,
        searchKeymap: false,
      }}
    />
  );
}
