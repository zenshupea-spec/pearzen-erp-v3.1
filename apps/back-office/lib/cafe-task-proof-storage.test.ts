import { describe, expect, it } from 'vitest';

import {
  CAFE_TASK_PROOFS_BUCKET,
  cafeTaskProofPurgeAfterIso,
  formatCafeTaskProofStorageRef,
  isCafeTaskProofPurged,
  parseCafeTaskProofStorageRef,
} from '../../../packages/supabase/cafe-task-proof-storage';

describe('cafe-task-proof-storage', () => {
  it('formats and parses storage:// refs', () => {
    const ref = formatCafeTaskProofStorageRef(
      CAFE_TASK_PROOFS_BUCKET,
      'cafe-task-proof/emp-1/task-1.jpg',
    );
    expect(parseCafeTaskProofStorageRef(ref)).toEqual({
      bucket: CAFE_TASK_PROOFS_BUCKET,
      objectPath: 'cafe-task-proof/emp-1/task-1.jpg',
    });
  });

  it('parses legacy attendance_selfies public URLs', () => {
    const legacy =
      'https://example.supabase.co/storage/v1/object/public/attendance_selfies/cafe-task-proof/x/y.jpg';
    expect(parseCafeTaskProofStorageRef(legacy)).toEqual({
      bucket: 'attendance_selfies',
      objectPath: 'cafe-task-proof/x/y.jpg',
    });
  });

  it('schedules purge 14 days after upload', () => {
    expect(cafeTaskProofPurgeAfterIso(new Date('2026-06-01T12:00:00.000Z'))).toBe('2026-06-15');
  });

  it('hides proofs once purge_after is before today', () => {
    expect(isCafeTaskProofPurged('2026-06-14', '2026-06-15')).toBe(true);
    expect(isCafeTaskProofPurged('2026-06-15', '2026-06-15')).toBe(false);
    expect(isCafeTaskProofPurged(undefined, '2026-06-15')).toBe(false);
  });
});
