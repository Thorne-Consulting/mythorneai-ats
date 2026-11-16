import type { ReactNode } from 'react';

export type Option = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  group?: string;
  keywords?: string;
};
/** Mantine-style `data`: plain strings or option objects. */
export type OptionData = readonly (string | Option)[];

export function toOptions(data: OptionData): Option[] {
  return data.map((d) => (typeof d === 'string' ? { value: d, label: d } : d));
}

export function optionText(o: Option) {
  return o.keywords ?? (typeof o.label === 'string' ? o.label : o.value);
}
