'use client';

import { useMemo, useState } from 'react';
import { Input, Select } from '@/components/ui';
import { timePresets, whenText } from '@/features/messages/inbox-format';

/**
 * When an email goes out: now, a preset at 9:00 in your time (Tomorrow morning, Next Monday) or a
 * time you pick. `onChange` gets an ISO time, or null for now. The outbox holds it until then.
 */
export function SendTimeSelect({
  onChange,
  label = 'Send',
}: {
  onChange: (sendAt: string | null) => void;
  label?: string;
}) {
  const presets = useMemo(() => timePresets(), []);
  const [choice, setChoice] = useState('now');
  const [picked, setPicked] = useState('');
  const min = useMemo(() => localInput(new Date(Date.now() + 10 * 60_000)), []);
  const pick = (value: string) => {
    setChoice(value);
    if (value === 'now') onChange(null);
    else if (value === 'pick') onChange(picked ? new Date(picked).toISOString() : null);
    else onChange(presets[Number(value)].at.toISOString());
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label={label}
        value={choice}
        onChange={(value) => value && pick(value)}
        data={[
          { value: 'now', label: 'Now' },
          ...presets.map((preset, i) => ({
            value: String(i),
            label: `${preset.label} (${whenText(preset.at)})`,
          })),
          { value: 'pick', label: 'Pick a time' },
        ]}
      />
      {choice === 'pick' && (
        <Input
          type="datetime-local"
          label="Date and time"
          min={min}
          value={picked}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setPicked(value);
            onChange(value ? new Date(value).toISOString() : null);
          }}
        />
      )}
    </div>
  );
}

/** A Date as the value a datetime-local input expects, in local time. */
const localInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
