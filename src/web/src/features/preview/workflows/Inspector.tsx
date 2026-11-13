'use client';

import { useRef, type ReactNode } from 'react';
import type { Edge } from '@xyflow/react';
import { Copy, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Code,
  Eyebrow,
  Input,
  NumberInput,
  Select,
  Separator,
  TagsInput,
  Textarea,
} from '@/components/ui';
import {
  DURATION_UNITS,
  EMAIL_VARIABLES,
  defOf,
  splitValues,
  StepIcon,
  type FieldDef,
  type StepNode,
  type Values,
} from './catalog';

export type Connection = { output: string; target: string | null };

/** Edit every property of the selected step. `key` lets the editor coalesce typing into one undo. */
export function StepInspector({
  node,
  connections,
  onChange,
  onDuplicate,
  onDelete,
}: {
  node: StepNode;
  connections: Connection[] | null;
  onChange: (patch: Values, key: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const def = defOf(node.data.kind);
  const v = node.data.values;
  const textarea = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (key: string, variable: string) => {
    const el = textarea.current;
    const text = v[key] ?? '';
    const at = el?.selectionStart ?? text.length;
    onChange(
      { [key]: text.slice(0, at) + variable + text.slice(el?.selectionEnd ?? at) },
      `${key}:var`,
    );
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + variable.length, at + variable.length);
    });
  };

  const field = (f: FieldDef): ReactNode => {
    const set = (value: string) => onChange({ [f.key]: value, ...f.apply?.(value) }, f.key);
    switch (f.type) {
      case 'select':
        return (
          <Select
            key={f.key}
            inset
            label={f.label}
            data={f.options ?? []}
            value={v[f.key]}
            onChange={(x) => x && set(x)}
          />
        );
      case 'text':
        return (
          <Input
            key={f.key}
            inset
            label={f.label}
            description={f.description}
            placeholder={f.placeholder}
            value={v[f.key] ?? ''}
            onChange={(e) => set(e.currentTarget.value)}
          />
        );
      case 'tags':
        return (
          <TagsInput
            key={f.key}
            label={f.label}
            description={f.description}
            value={splitValues(v[f.key])}
            onChange={(tags) => set(tags.join(', '))}
          />
        );
      case 'duration': {
        const [amount = '', ...unit] = (v[f.key] ?? '').split(' ');
        const unitText = unit.join(' ') || 'days';
        return (
          <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
            <NumberInput
              inset
              label={f.label}
              min={0}
              value={amount === '' ? '' : Number(amount)}
              onValueChange={(n) => set(`${n} ${unitText}`)}
            />
            <Select
              inset
              label="Unit"
              data={DURATION_UNITS}
              value={unitText}
              onChange={(u) => u && set(`${amount || 0} ${u}`)}
            />
          </div>
        );
      }
      case 'textarea': {
        const withVariables = def.group === 'Actions' || def.group === 'Approvals';
        return (
          <div key={f.key} className="space-y-2">
            <Textarea
              ref={textarea}
              label={f.label}
              placeholder={f.placeholder}
              minRows={f.key === 'body' ? 6 : 3}
              value={v[f.key] ?? ''}
              onChange={(e) => set(e.currentTarget.value)}
            />
            {withVariables && (
              <div>
                <p className="mb-1.5 text-2xs text-fg-subtle">Insert a variable at the cursor</p>
                <div className="flex flex-wrap gap-1.5">
                  {EMAIL_VARIABLES.map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => insertVariable(f.key, x)}
                      className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-2xs text-fg-muted hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {x.slice(2, -2)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <StepIcon kind={node.data.kind} className="mt-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <Eyebrow>{def.eyebrow}</Eyebrow>
          <h2 className="truncate text-lg font-semibold text-fg">{v.name || def.label}</h2>
        </div>
      </div>
      <Input
        inset
        label="Step name"
        placeholder={def.label}
        value={v.name ?? ''}
        onChange={(e) => onChange({ name: e.currentTarget.value }, 'name')}
      />
      {def.fields.map(field)}
      {node.data.kind === 'action.send_email' && <EmailPreview subject={v.subject} body={v.body} />}

      {connections && (
        <div>
          <Eyebrow className="mb-2">Branches</Eyebrow>
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {connections.map((c) => (
              <li
                key={c.output}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="font-medium text-fg">{c.output}</span>
                {c.target ? (
                  <span className="truncate text-fg-muted">→ {c.target}</span>
                ) : (
                  <Badge tone={def.branching ? 'red' : 'gray'} size="sm">
                    Not connected
                  </Badge>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-2xs text-fg-subtle">
            Drag from a branch dot on the canvas to connect it.
          </p>
        </div>
      )}

      <Separator />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Copy />} onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button variant="danger-quiet" size="sm" leftIcon={<Trash2 />} onClick={onDelete}>
          Delete step
        </Button>
      </div>
    </div>
  );
}

function EmailPreview({ subject = '', body = '' }: { subject?: string; body?: string }) {
  const chips = (text: string) =>
    text
      .split(/(\{\{[^}]+\}\})/)
      .map((part, i) => (part.startsWith('{{') ? <Code key={i}>{part}</Code> : part));
  return (
    <div className="rounded-lg border border-border-subtle bg-muted p-4">
      <Eyebrow>Message preview</Eyebrow>
      <p className="mt-2 text-base font-semibold text-fg">{chips(subject)}</p>
      <Separator className="my-3" />
      <div className="space-y-2 text-sm whitespace-pre-line text-fg-muted">{chips(body)}</div>
    </div>
  );
}

export function EdgeInspector({
  edge,
  from,
  to,
  onChange,
  onDelete,
}: {
  edge: Edge;
  from: string;
  to: string;
  onChange: (label: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>Connection</Eyebrow>
        <h2 className="text-lg font-semibold text-fg">
          {from} → {to}
        </h2>
        {edge.sourceHandle && (
          <p className="text-sm text-fg-subtle">
            Leaves from the “{String(edge.sourceHandle).replace(/^v:/, '')}” output.
          </p>
        )}
      </div>
      <Input
        inset
        label="Label"
        placeholder="Shown on the line"
        value={typeof edge.label === 'string' ? edge.label : ''}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      <Separator />
      <Button variant="danger-quiet" size="sm" leftIcon={<Trash2 />} onClick={onDelete}>
        Delete connection
      </Button>
    </div>
  );
}
