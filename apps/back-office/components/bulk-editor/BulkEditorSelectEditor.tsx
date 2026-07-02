'use client';

import type { RenderEditCellProps } from 'react-data-grid';

import type { BulkEditorRow } from '../../lib/bulk-roster-web-editor-spec';

export type BulkEditorSelectEditorProps = RenderEditCellProps<BulkEditorRow> & {
  options: readonly string[];
  allowEmpty?: boolean;
  placeholder?: string;
};

export function BulkEditorSelectEditor({
  column,
  row,
  onRowChange,
  onClose,
  options,
  allowEmpty = true,
  placeholder = 'Select…',
}: BulkEditorSelectEditorProps) {
  const value = String(row[column.key] ?? '');

  return (
    <select
      className="rdg-text-editor h-full w-full border-0 bg-white px-2 text-xs font-semibold text-slate-900 outline-none ring-2 ring-sky-400"
      autoFocus
      value={value}
      onChange={(event) => {
        onRowChange({ ...row, [column.key]: event.target.value }, true);
      }}
      onBlur={() => onClose(true)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose(false);
      }}
    >
      {allowEmpty ? (
        <option value="">{placeholder}</option>
      ) : null}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
