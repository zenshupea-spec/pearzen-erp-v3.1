import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HR_SECTOR_NAMES,
  isSectorManagerEmployee,
  mergeHrSectorNames,
  normalizeHrSectorName,
  parseHrSectorNamesFromStorage,
} from './hr-sectors';

describe('hr-sectors', () => {
  it('normalizes sector names to uppercase', () => {
    expect(normalizeHrSectorName(' colombo 1 ')).toBe('COLOMBO 1');
  });

  it('merges seed list with saved names without duplicates', () => {
    expect(mergeHrSectorNames(DEFAULT_HR_SECTOR_NAMES, ['GALLE', 'colombo 1'])).toEqual([
      'COLOMBO 1',
      'COLOMBO 2',
      'COLOMBO 3',
      'KANDY',
      'MATARA',
      'KURUNAGALA',
      'GALLE',
    ]);
  });

  it('parses storage array', () => {
    expect(parseHrSectorNamesFromStorage(['matara', '', '  galle  '])).toEqual([
      'MATARA',
      'GALLE',
    ]);
  });

  it('detects SM by rank under Head Office', () => {
    expect(isSectorManagerEmployee({ group: 'HEAD_OFFICE', rank: 'SM' })).toBe(true);
    expect(isSectorManagerEmployee({ group: 'SECTOR_MANAGER', rank: 'SM' })).toBe(true);
    expect(isSectorManagerEmployee({ group: 'HEAD_OFFICE', rank: 'GAD' })).toBe(false);
  });
});
