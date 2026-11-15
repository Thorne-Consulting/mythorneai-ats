'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Copy, MailCheck, Trash2 } from 'lucide-react';
import { api } from '@/api';
import {
  Autocomplete,
  Badge,
  Button,
  ConfirmDialog,
  DescriptionList,
  Eyebrow,
  Input,
  NumberInput,
  SearchSelect,
  Select,
  Separator,
  TagsInput,
  Textarea,
  toast,
} from '@/components/ui';
import { StepIcon } from '@/components/workflow/StepNode';
import { cn } from '@/lib/cn';
import { eyebrowOf, defOf, splitValues, valueOptions, type FieldDef } from './catalog';
import { toneOf } from './StepFlowNode';
import type { GraphNode, Lookups, Problem, Values } from './workflow-api';

export type Connection = { output: string; target: string | null };

const UNITS = ['minutes', 'hours', 'days', 'business days', 'weeks'];
const NONE = '__none';

/** Edit the selected step. `key` lets the editor group typing in one field into one undo step. */
export function StepInspector({
  workflowId,
  node,
  lookups,
  problems,
  connections,
  readOnly,
  onChange,
  onDuplicate,
  onDelete,
}: {
  /** Lets an email step send a test to the person editing. */
  workflowId?: string;
  node: GraphNode;
  lookups: Lookups;
  problems: Problem[];
  connections: Connection[] | null;
  readOnly: boolean;
  onChange: (patch: Values, key: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const def = defOf(node.kind);
  const v = node.values;
  const [confirm, setConfirm] = useState(false);
  const boxes = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});
  const fields = def.fields.filter((f) => !f.show || f.show(v));

  const insertVariable = (key: string, variable: string) => {
    const el = boxes.current[key];
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

  const describe = (f: FieldDef) =>
    typeof f.description === 'function' ? f.description(lookups, v) : f.description;

  const field = (f: FieldDef): ReactNode => {
    const set = (value: string) => {
      const patch: Values = { [f.key]: value };
      // A new detail to check starts with a rule and value that make sense for it.
      if (node.kind === 'logic.condition' && f.key === 'field') {
        patch.operator = 'is';
        patch.value = value === 'replied' ? 'yes' : '';
      }
      onChange(patch, f.key);
    };
    const options = f.options?.(lookups, v) ?? [];
    const common = { label: f.label, description: describe(f) };
    switch (f.type) {
      case 'select': {
        // The menu cannot hold an empty value ("Write my own" is ''), so it travels as NONE.
        const none = options.some((o) => o.value === '');
        return (
          <Select
            key={f.key}
            {...common}
            data={options.map((o) => (o.value === '' ? { ...o, value: NONE } : o))}
            value={none && !v[f.key] ? NONE : (v[f.key] ?? '')}
            onChange={(x) => set(x === NONE ? '' : (x ?? ''))}
          />
        );
      }
      case 'search':
        return (
          <SearchSelect
            key={f.key}
            {...common}
            data={options}
            value={v[f.key] || null}
            onChange={(x) => x && set(x)}
            placeholder="Type to search"
          />
        );
      case 'number':
        return (
          <NumberInput
            key={f.key}
            {...common}
            min={1}
            max={365}
            value={v[f.key] === '' || v[f.key] === undefined ? '' : Number(v[f.key])}
            onValueChange={(n) => set(n === '' ? '' : String(Math.round(n)))}
          />
        );
      case 'duration': {
        const [amount = '', ...unit] = (v[f.key] ?? '').split(' ');
        const unitText = unit.join(' ') || 'days';
        const units = f.units ?? UNITS;
        return (
          <div
            key={f.key}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-end gap-2"
          >
            <NumberInput
              label={f.label}
              min={f.units ? 0 : 1}
              value={amount === '' ? '' : Number(amount)}
              onValueChange={(n) => set(`${n === '' ? '' : Math.round(n)} ${unitText}`)}
            />
            <Select
              aria-label="Unit"
              data={units.includes(unitText) ? units : [...units, unitText]}
              value={unitText}
              onChange={(u) => u && set(`${amount || 1} ${u}`)}
            />
          </div>
        );
      }
      case 'tags':
        return (
          <TagsInput
            key={f.key}
            {...common}
            data={options}
            value={splitValues(v[f.key])}
            onChange={(tags) => set(tags.join(', '))}
            placeholder="Type and press Enter"
          />
        );
      case 'value': {
        const numeric = lookups.fields.find((x) => x.value === v.field)?.type === 'number';
        const fixed = node.kind === 'logic.condition' ? valueOptions(v.field, lookups) : null;
        if (fixed && ['replied', 'stageType', 'status'].includes(v.field))
          return (
            <Select
              key={f.key}
              {...common}
              data={fixed}
              value={v[f.key] ?? ''}
              onChange={(x) => set(x ?? '')}
            />
          );
        if (numeric)
          return (
            <NumberInput
              key={f.key}
              {...common}
              value={v[f.key] === '' || v[f.key] === undefined ? '' : Number(v[f.key])}
              onValueChange={(n) => set(n === '' ? '' : String(n))}
            />
          );
        return (
          <Autocomplete
            key={f.key}
            {...common}
            data={options}
            value={v[f.key] ?? ''}
            onChange={set}
            placeholder={options.length ? 'Pick or type a value' : undefined}
          />
        );
      }
      case 'text':
      case 'textarea': {
        const box =
          f.type === 'text' ? (
            <Input
              ref={(el) => {
                boxes.current[f.key] = el;
              }}
              label={f.label}
              placeholder={f.placeholder}
              value={v[f.key] ?? ''}
              onChange={(e) => set(e.currentTarget.value)}
            />
          ) : (
            <Textarea
              ref={(el) => {
                boxes.current[f.key] = el;
              }}
              label={f.label}
              placeholder={f.placeholder}
              minRows={f.key === 'body' ? 7 : 3}
              value={v[f.key] ?? ''}
              onChange={(e) => set(e.currentTarget.value)}
            />
          );
        return (
          <div key={f.key} className="space-y-1.5">
            {box}
            {f.variables && f.type === 'textarea' && (
              <Variables lookups={lookups} onPick={(key) => insertVariable(f.key, `{{${key}}}`)} />
            )}
          </div>
        );
      }
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <StepIcon
          icon={def.icon}
          tone={toneOf(def.group)}
          className="mt-0.5 size-9 [&_svg]:size-5"
        />
        <div className="min-w-0 flex-1">
          <Eyebrow>{eyebrowOf(def)}</Eyebrow>
          <h2 className="truncate text-lg font-semibold text-fg">{v.name || def.label}</h2>
          <p className="mt-0.5 text-sm text-fg-muted">{def.help}</p>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="space-y-1.5 rounded-lg bg-tone-red-bg px-3 py-2.5">
          {problems.map((p) => (
            <li key={p.message} className="flex gap-2 text-sm text-tone-red-fg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {p.message}
            </li>
          ))}
        </ul>
      )}

      {readOnly ? (
        <DescriptionList
          items={fields.map((f) => ({
            label: f.label,
            value: readable(f, v, lookups) || 'Not set',
          }))}
        />
      ) : (
        <>
          <Input
            label="Step name"
            description="Optional. Shown on the canvas and in run history."
            placeholder={def.label}
            value={v.name ?? ''}
            onChange={(e) => onChange({ name: e.currentTarget.value }, 'name')}
          />
          {fields.map(field)}
        </>
      )}

      {node.kind === 'action.send_email' && !v.template && (
        <EmailPreview subject={v.subject} body={v.body} lookups={lookups} />
      )}
      {node.kind === 'action.send_email' && workflowId && !readOnly && (
        <TestEmailButton workflowId={workflowId} node={node} disabled={problems.length > 0} />
      )}

      {connections && (
        <div>
          <Eyebrow className="mb-2">Paths</Eyebrow>
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
                  <Badge tone="gray" size="sm">
                    Ends here
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!readOnly && (
        <>
          <Separator />
          <div className="flex flex-wrap gap-2">
            {!def.kind.startsWith('trigger.') && (
              <Button variant="secondary" size="sm" leftIcon={<Copy />} onClick={onDuplicate}>
                Duplicate step
              </Button>
            )}
            <Button
              variant="danger-quiet"
              size="sm"
              leftIcon={<Trash2 />}
              onClick={() => setConfirm(true)}
            >
              Delete step
            </Button>
          </div>
          <ConfirmDialog
            opened={confirm}
            onClose={() => setConfirm(false)}
            title="Delete this step?"
            message={
              connections?.some((c) => c.target) || def.kind.startsWith('trigger.')
                ? 'The steps after it stay, but they are no longer connected. You can undo this.'
                : 'You can undo this.'
            }
            confirmLabel="Delete step"
            onConfirm={onDelete}
          />
        </>
      )}
    </div>
  );
}

/** Sends the step's email, filled in for a real application, to the person editing. */
function TestEmailButton({
  workflowId,
  node,
  disabled,
}: {
  workflowId: string;
  node: GraphNode;
  disabled: boolean;
}) {
  const send = useMutation({
    mutationFn: () =>
      api.post<{ recipient: string; candidateName: string }>(
        `/api/workflows/${workflowId}/test-email`,
        { node },
      ),
    onSuccess: (sent) =>
      toast.success(
        `Test email sent to ${sent.recipient}`,
        `It uses ${sent.candidateName}’s details. Nothing went to the candidate.`,
      ),
    onError: (error: Error) => toast.error('Could not send the test email', error.message),
  });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<MailCheck />}
        loading={send.isPending}
        disabled={disabled}
        onClick={() => send.mutate()}
      >
        Send a test email to me
      </Button>
      {disabled && <span className="text-xs text-fg-subtle">Fix the problems above first.</span>}
    </div>
  );
}

/** A field's value as words, for the read-only view on phones. */
function readable(f: FieldDef, v: Values, l: Lookups) {
  const value = v[f.key] ?? '';
  const hit = f.options?.(l, v).find((o) => o.value === value)?.label;
  return typeof hit === 'string' ? hit : value;
}

export function Variables({
  lookups,
  onPick,
}: {
  lookups: Lookups;
  onPick: (key: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-2xs text-fg-subtle">
        Add a detail. It fills in for each candidate.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {lookups.variables.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => onPick(x.key)}
            className="rounded-full bg-secondary px-2 py-0.5 text-2xs text-fg-muted hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmailPreview({
  subject = '',
  body = '',
  lookups,
}: {
  subject?: string;
  body?: string;
  lookups: Lookups;
}) {
  const chips = (text: string) =>
    text.split(/(\{\{\s*\w+\s*\}\})/).map((part, i) => {
      const key = part.match(/^\{\{\s*(\w+)\s*\}\}$/)?.[1];
      if (!key) return part;
      const known = lookups.variables.find((x) => x.key === key);
      return (
        <span
          key={i}
          className={cn(
            'rounded-sm px-1 py-px text-xs',
            known ? 'bg-accent text-accent-foreground' : 'bg-tone-red-bg text-tone-red-fg',
          )}
          title={known ? undefined : 'We don’t know this detail, so it would be sent as typed.'}
        >
          {known?.label ?? part}
        </span>
      );
    });
  return (
    <div className="rounded-lg border border-border-subtle bg-muted p-4">
      <Eyebrow>Preview</Eyebrow>
      <p className="mt-2 text-base font-semibold text-fg">{chips(subject)}</p>
      <Separator className="my-3" />
      <div className="text-sm whitespace-pre-line text-fg-muted">{chips(body)}</div>
    </div>
  );
}
