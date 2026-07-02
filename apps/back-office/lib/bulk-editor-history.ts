import type { BulkEditorRow } from './bulk-roster-web-editor-spec';

const MAX_UNDO_STEPS = 50;

export type BulkEditorHistoryStacks = {
  undo: BulkEditorRow[][];
  redo: BulkEditorRow[][];
};

export function cloneBulkEditorRows(rows: readonly BulkEditorRow[]): BulkEditorRow[] {
  return rows.map((row) => ({ ...row }));
}

export function rowsEqual(a: readonly BulkEditorRow[], b: readonly BulkEditorRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (left._rowId !== right._rowId) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (String(left[key] ?? '') !== String(right[key] ?? '')) return false;
    }
  }
  return true;
}

export function pushBulkEditorHistory(
  stacks: BulkEditorHistoryStacks,
  previousRows: readonly BulkEditorRow[],
): BulkEditorHistoryStacks {
  const undo = [...stacks.undo, cloneBulkEditorRows(previousRows)];
  if (undo.length > MAX_UNDO_STEPS) undo.shift();
  return { undo, redo: [] };
}

export function undoBulkEditorHistory(
  stacks: BulkEditorHistoryStacks,
  currentRows: readonly BulkEditorRow[],
): { stacks: BulkEditorHistoryStacks; rows: BulkEditorRow[] | null } {
  if (stacks.undo.length === 0) return { stacks, rows: null };
  const undo = [...stacks.undo];
  const previous = undo.pop()!;
  const redo = [...stacks.redo, cloneBulkEditorRows(currentRows)];
  return {
    stacks: { undo, redo },
    rows: cloneBulkEditorRows(previous),
  };
}

export function redoBulkEditorHistory(
  stacks: BulkEditorHistoryStacks,
  currentRows: readonly BulkEditorRow[],
): { stacks: BulkEditorHistoryStacks; rows: BulkEditorRow[] | null } {
  if (stacks.redo.length === 0) return { stacks, rows: null };
  const redo = [...stacks.redo];
  const next = redo.pop()!;
  const undo = [...stacks.undo, cloneBulkEditorRows(currentRows)];
  return {
    stacks: { undo, redo },
    rows: cloneBulkEditorRows(next),
  };
}
