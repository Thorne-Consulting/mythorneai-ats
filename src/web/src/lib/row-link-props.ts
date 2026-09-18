import type { KeyboardEvent } from 'react';

/** Makes a table row usable as a link with either a pointer or keyboard. */
export function rowLinkProps(label: string, open: () => void) {
  return {
    className: 'clickable-row',
    role: 'link',
    tabIndex: 0,
    'aria-label': label,
    onClick: open,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      open();
    },
  };
}
