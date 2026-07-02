import { describe, expect, it } from 'vitest';

import {
  assessCvsDatabaseBackupPosture,
  buildCvsDatabaseBackupObjectKey,
  cvsDatabaseBackupKeysToPrune,
  isLogicalBackupFresh,
  latestBackupFromObjectKeys,
  parseCvsDatabaseBackupObjectKey,
} from '../../../packages/supabase/cvs-database-backup';

describe('buildCvsDatabaseBackupObjectKey', () => {
  it('names dumps under cvs/YYYY/MM/DD with UTC stamp', () => {
    const key = buildCvsDatabaseBackupObjectKey(new Date('2026-06-24T03:15:00.000Z'));
    expect(key).toBe('cvs/2026/06/24/postgres-20260624T031500Z.sql.gz');
  });
});

describe('parseCvsDatabaseBackupObjectKey', () => {
  it('round-trips backup keys', () => {
    const key = 'cvs/2026/06/24/postgres-20260624T031500Z.sql.gz';
    expect(parseCvsDatabaseBackupObjectKey(key)?.toISOString()).toBe(
      '2026-06-24T03:15:00.000Z',
    );
  });
});

describe('cvsDatabaseBackupKeysToPrune', () => {
  it('drops keys older than retention window', () => {
    const keys = [
      'cvs/2026/05/01/postgres-20260501T020000Z.sql.gz',
      'cvs/2026/06/20/postgres-20260620T020000Z.sql.gz',
    ];
    const pruned = cvsDatabaseBackupKeysToPrune(keys, 30, new Date('2026-06-24T00:00:00.000Z'));
    expect(pruned).toEqual(['cvs/2026/05/01/postgres-20260501T020000Z.sql.gz']);
  });
});

describe('isLogicalBackupFresh', () => {
  it('accepts dumps within 25 hours', () => {
    const now = new Date('2026-06-24T12:00:00.000Z');
    const latest = new Date('2026-06-23T14:00:00.000Z');
    expect(isLogicalBackupFresh(latest, 25, now)).toBe(true);
  });

  it('rejects stale dumps', () => {
    const now = new Date('2026-06-24T12:00:00.000Z');
    const latest = new Date('2026-06-22T12:00:00.000Z');
    expect(isLogicalBackupFresh(latest, 25, now)).toBe(false);
  });
});

describe('assessCvsDatabaseBackupPosture', () => {
  it('passes when PITR is enabled', () => {
    const result = assessCvsDatabaseBackupPosture({
      orgPlan: 'pro',
      pitrEnabled: true,
      latestLogicalBackupAt: null,
    });
    expect(result.compliant).toBe(true);
    expect(result.path).toBe('pitr');
  });

  it('requires fresh logical dump on Free tier', () => {
    const fresh = assessCvsDatabaseBackupPosture({
      orgPlan: 'free',
      pitrEnabled: false,
      latestLogicalBackupAt: new Date('2026-06-24T02:00:00.000Z'),
    });
    expect(fresh.compliant).toBe(true);
    expect(fresh.path).toBe('logical_dump');

    const stale = assessCvsDatabaseBackupPosture({
      orgPlan: 'free',
      pitrEnabled: false,
      latestLogicalBackupAt: new Date('2026-06-20T02:00:00.000Z'),
    });
    expect(stale.compliant).toBe(false);
  });
});

describe('latestBackupFromObjectKeys', () => {
  it('picks the newest dump key', () => {
    const latest = latestBackupFromObjectKeys([
      'cvs/2026/06/22/postgres-20260622T020000Z.sql.gz',
      'cvs/2026/06/24/postgres-20260624T020000Z.sql.gz',
    ]);
    expect(latest?.toISOString()).toBe('2026-06-24T02:00:00.000Z');
  });
});
