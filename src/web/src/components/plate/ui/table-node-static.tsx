import * as React from 'react';

import type { TTableCellElement, TTableElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';

import { BaseTablePlugin } from '@platejs/table';
import { SlateElement } from 'platejs/static';

import { cn } from '@/components/plate/lib/utils';

// ponytail: read view lets the browser size columns to their content. Column widths dragged in
// the editor are not stored in Markdown, so there is nothing to honour here.
export function TableElementStatic({ children, ...props }: SlateElementProps<TTableElement>) {
  return (
    <SlateElement {...props} className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <tbody>{children}</tbody>
      </table>
    </SlateElement>
  );
}

export function TableRowElementStatic(props: SlateElementProps) {
  return <SlateElement {...props} as="tr" />;
}

export function TableCellElementStatic({
  isHeader,
  ...props
}: SlateElementProps<TTableCellElement> & { isHeader?: boolean }) {
  const { api } = props.editor.getPlugin(BaseTablePlugin);
  return (
    <SlateElement
      {...props}
      as={isHeader ? 'th' : 'td'}
      className={cn(
        'min-w-24 border border-border px-3 py-2 align-top *:py-0',
        isHeader ? 'bg-muted font-semibold' : 'bg-card',
      )}
      attributes={{
        ...props.attributes,
        colSpan: api.table.getColSpan(props.element),
        rowSpan: api.table.getRowSpan(props.element),
      }}
    />
  );
}

export function TableCellHeaderElementStatic(props: SlateElementProps<TTableCellElement>) {
  return <TableCellElementStatic {...props} isHeader />;
}
