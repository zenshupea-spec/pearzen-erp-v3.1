import { describe, expect, it } from 'vitest';

import {
  pushBulkEditorHistory,
  redoBulkEditorHistory,
  undoBulkEditorHistory,
} from './bulk-editor-history';
import type { BulkEditorRow } from './bulk-roster-web-editor-spec';

const row = (id: string, name: string): BulkEditorRow => ({
  _rowId: id,
  full_name: name,
});

describe('bulk-editor-history', () => {
  it('pushes undo and clears redo on edit', () => {
    const stacks = pushBulkEditorHistory({ undo: [], redo: [[row('x', 'old')]] }, [row('a', 'A')]);
    expect(stacks.undo).toHaveLength(1);
    expect(stacks.redo).toHaveLength(0);
  });

  it('undoes and redoes row snapshots', () => {
    let stacks = { undo: [] as BulkEditorRow[][], redo: [] as BulkEditorRow[][] };
    const v1 = [row('1', 'One')];
    const v2 = [row('1', 'One'), row('2', 'Two')];

    stacks = pushBulkEditorHistory(stacks, v1);
    const undone = undoBulkEditorHistory(stacks, v2);
    expect(undone.rows).toEqual(v1);

    const redone = redoBulkEditorHistory(undone.stacks, v1);
    expect(redone.rows).toEqual(v2);
  });
});
