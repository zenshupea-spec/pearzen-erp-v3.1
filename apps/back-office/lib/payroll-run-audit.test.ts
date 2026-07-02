import { describe, expect, it } from 'vitest';

import { buildBatchId } from './payroll-run-types';
import { buildAdvanceBatchId } from './advance-run-types';

describe('payroll batch audit identifiers', () => {
  it('uses PR-YYMM-SEC | CAF batch ids for payroll runs', () => {
    expect(buildBatchId(2026, 5, 'security')).toBe('PR-2605-SEC');
    expect(buildBatchId(2026, 5, 'cafe')).toBe('PR-2605-CAF');
  });

  it('uses ADV-YYMM-* batch ids for advance runs', () => {
    expect(buildAdvanceBatchId(2026, 5, 'ho')).toBe('ADV-2605-HO');
    expect(buildAdvanceBatchId(2026, 5, 'guard_commercial')).toBe('ADV-2605-GCB');
  });
});
