import { describe, expect, it } from 'vitest';

import {
  formatOmCandidateLabel,
  isOmRankEmployee,
  mapOmRankCandidates,
  normalizeSectorOmAssignmentSmEpf,
  canManageSectorOmAssignments,
  resolveEmployeeEpfNo,
} from './om-sector-assignment-spec';

describe('om-sector-assignment-spec', () => {
  it('normalizes SM EPF keys and rejects unassigned bucket', () => {
    expect(normalizeSectorOmAssignmentSmEpf('144')).toBe('144');
    expect(normalizeSectorOmAssignmentSmEpf('  roy ')).toBe('ROY');
    expect(normalizeSectorOmAssignmentSmEpf('')).toBeNull();
    expect(normalizeSectorOmAssignmentSmEpf('__unassigned__')).toBeNull();
  });

  it('detects OM rank employees', () => {
    expect(isOmRankEmployee('OM')).toBe(true);
    expect(isOmRankEmployee(' om ')).toBe(true);
    expect(isOmRankEmployee('MD')).toBe(false);
  });

  it('maps active OM staff to OM candidates only', () => {
    const candidates = mapOmRankCandidates([
      { id: '1', fullName: 'Alice OM', epfNo: '12001', email: 'a@cvs.lk', rank: 'OM' },
      { id: '2', fullName: 'Bob MD', email: 'b@cvs.lk', rank: 'MD' },
      { id: '3', fullName: 'Carol OM', epf_num: '12002', email: null, rank: 'OM' },
      { id: '4', fullName: 'Dan OM', email: null, rank: 'OM' },
    ]);

    expect(candidates).toHaveLength(3);
    expect(candidates[0]?.employeeId).toBe('1');
    expect(candidates[0]?.epfNo).toBe('12001');
    expect(candidates[1]?.fullName).toBe('Carol OM');
    expect(candidates[1]?.epfNo).toBe('12002');
    expect(candidates[2]?.fullName).toBe('Dan OM');
    expect(candidates[2]?.epfNo).toBeNull();
  });

  it('formats OM candidate labels with EPF and name', () => {
    expect(formatOmCandidateLabel('Alice OM', '12001')).toBe('12001 · Alice OM');
    expect(formatOmCandidateLabel('Bob OM', null)).toBe('Bob OM');
    expect(resolveEmployeeEpfNo({ emp_number: ' 99 ' })).toBe('99');
  });

  it('allows only MD and OD to manage sector OM assignments', () => {
    expect(canManageSectorOmAssignments('MD')).toBe(true);
    expect(canManageSectorOmAssignments('OD')).toBe(true);
    expect(canManageSectorOmAssignments('om')).toBe(false);
    expect(canManageSectorOmAssignments('OM')).toBe(false);
    expect(canManageSectorOmAssignments('FM')).toBe(false);
    expect(canManageSectorOmAssignments('HR')).toBe(false);
    expect(canManageSectorOmAssignments(null)).toBe(false);
  });
});
