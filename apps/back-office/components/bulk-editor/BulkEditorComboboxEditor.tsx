'use client';

import { useMemo, useRef } from 'react';
import type { RenderEditCellProps } from 'react-data-grid';

import { normalizeBulkEditorDropdownValue } from '../../lib/bulk-editor-dropdown-columns';
import type { BulkEditorRow } from '../../lib/bulk-roster-web-editor-spec';

export type BulkEditorComboboxEditorProps = RenderEditCellProps<BulkEditorRow> & {
  options: readonly string[];
};

export function BulkEditorComboboxEditor({
  column,
  row,
  onRowChange,
  onClose,
  options,
}: BulkEditorComboboxEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useMemo(
    () => `bulk-editor-enum-${column.key}-${row._rowId}`,
    [column.key, row._rowId],
  );

  return (
    <>
      <input
        ref={inputRef}
        className="rdg-text-editor h-full w-full border-0 bg-white px-2 text-xs font-semibold uppercase text-slate-900 outline-none ring-2 ring-sky-400"
        list={listId}
        autoFocus
        defaultValue={String(row[column.key] ?? '')}
        placeholder="Type or pick…"
        onChange={(event) => {
          onRowChange({ ...row, [column.key]: event.target.value }, false);
        }}
        onBlur={() => {
          const normalized = normalizeBulkEditorDropdownValue(
            column.key,
            inputRef.current?.value ?? '',
          );
          onRowChange({ ...row, [column.key]: normalized }, true);
          onClose(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose(false);
          if (event.key === 'Enter') {
            event.preventDefault();
            inputRef.current?.blur();
          }
        }}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}
