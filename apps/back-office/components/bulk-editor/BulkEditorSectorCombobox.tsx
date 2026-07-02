'use client';

import { useMemo, useRef } from 'react';
import type { RenderEditCellProps } from 'react-data-grid';

import type { BulkEditorRow } from '../../lib/bulk-roster-web-editor-spec';
import { normalizeHrSectorName } from '../../lib/hr-sectors';

export type BulkEditorSectorComboboxProps = RenderEditCellProps<BulkEditorRow> & {
  sectorNames: readonly string[];
  onSectorBlur?: (rowId: string) => void;
};

export function BulkEditorSectorCombobox({
  row,
  onRowChange,
  onClose,
  sectorNames,
  onSectorBlur,
}: BulkEditorSectorComboboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useMemo(() => `bulk-editor-sectors-${row._rowId}`, [row._rowId]);

  return (
    <>
      <input
        ref={inputRef}
        className="rdg-text-editor h-full w-full border-0 bg-white px-2 text-xs font-semibold text-slate-900 outline-none ring-2 ring-sky-400"
        list={listId}
        autoFocus
        defaultValue={row.sector_name ?? ''}
        placeholder="Sector name"
        onChange={(event) => {
          onRowChange({ ...row, sector_name: event.target.value }, false);
        }}
        onBlur={() => {
          const normalized = normalizeHrSectorName(inputRef.current?.value ?? '');
          onRowChange({ ...row, sector_name: normalized }, true);
          onSectorBlur?.(row._rowId);
          onClose(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose(false);
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            inputRef.current?.blur();
          }
        }}
      />
      <datalist id={listId}>
        {sectorNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}
