import { describe, expect, it } from 'vitest';

import {
  canManageSectorRoleAssignments,
  employeeRankMatchesSectorRole,
  indexSectorRoleAssignments,
  legacyOmAssignmentToRoleRow,
  mapAllSectorRoleCandidates,
  mapSectorRoleCandidates,
  normalizeSectorRoleAssignmentSmEpf,
  normalizeSectorRoleCode,
  SECTOR_ROLE_ASSIGNMENTS_TABLE,
} from './sector-role-assignment-spec';

describe('sector-role-assignment-spec', () => {
  it('uses sector_role_assignments table name', () => {
    expect(SECTOR_ROLE_ASSIGNMENTS_TABLE).toBe('sector_role_assignments');
  });

  it('normalizes sm_epf like OM assignments', () => {
    expect(normalizeSectorRoleAssignmentSmEpf(' roy ')).toBe('ROY');
    expect(normalizeSectorRoleAssignmentSmEpf('__unassigned__')).toBeNull();
  });

  it('accepts sector board role codes only', () => {
    expect(normalizeSectorRoleCode('om')).toBe('OM');
    expect(normalizeSectorRoleCode('TM')).toBe('TM');
    expect(normalizeSectorRoleCode('hr')).toBe('HR');
    expect(normalizeSectorRoleCode('MD')).toBeNull();
    expect(normalizeSectorRoleCode('SC')).toBeNull();
  });

  it('allows only MD and OD to manage sector role assignments', () => {
    expect(canManageSectorRoleAssignments('MD')).toBe(true);
    expect(canManageSectorRoleAssignments('OD')).toBe(true);
    expect(canManageSectorRoleAssignments('OM')).toBe(false);
    expect(canManageSectorRoleAssignments('FM')).toBe(false);
  });

  it('requires assignee rank to match role slot', () => {
    expect(employeeRankMatchesSectorRole('OM', 'OM')).toBe(true);
    expect(employeeRankMatchesSectorRole('FM', 'OM')).toBe(false);
    expect(employeeRankMatchesSectorRole(' ad ', 'AD')).toBe(true);
  });

  it('maps candidates per role from staff list', () => {
    const staff = [
      { id: '1', fullName: 'Alice OM', email: 'a@cvs.lk', rank: 'OM', epf_no: '100' },
      { id: '2', fullName: 'Bob FM', email: 'b@cvs.lk', rank: 'FM', epf_no: '200' },
      { id: '3', fullName: 'Carol OM', email: null, rank: 'OM', epf_no: '101' },
    ];

    const omCandidates = mapSectorRoleCandidates(staff, 'OM');
    expect(omCandidates).toHaveLength(2);
    expect(omCandidates[0]?.employeeId).toBe('1');

    const all = mapAllSectorRoleCandidates(staff);
    expect(all.OM).toHaveLength(2);
    expect(all.FM).toHaveLength(1);
    expect(all.TM).toHaveLength(0);
  });

  it('indexes assignments by sm_epf and role_code', () => {
    const index = indexSectorRoleAssignments([
      {
        sm_epf: 'ROY',
        role_code: 'OM',
        employee_id: 'e1',
        full_name: 'Alice OM',
        epf_no: '100',
      },
      {
        sm_epf: 'ROY',
        role_code: 'FM',
        employee_id: 'e2',
        full_name: 'Bob FM',
        epf_no: '200',
      },
      {
        sm_epf: '__unassigned__',
        role_code: 'OM',
        employee_id: 'e3',
        full_name: 'Skip',
      },
    ]);

    expect(Object.keys(index)).toEqual(['ROY']);
    expect(index.ROY?.OM?.fullName).toBe('Alice OM');
    expect(index.ROY?.FM?.fullName).toBe('Bob FM');
  });

  it('converts legacy OM assignment rows for Step 04 backfill', () => {
    const mapped = legacyOmAssignmentToRoleRow({
      company_id: 'co-1',
      sm_epf: '144',
      om_employee_id: 'emp-1',
      assigned_by_employee_id: 'md-1',
      assigned_at: '2026-07-02T00:00:00.000Z',
    });

    expect(mapped.role_code).toBe('OM');
    expect(mapped.employee_id).toBe('emp-1');
    expect(mapped.sm_epf).toBe('144');
    expect(mapped.company_id).toBe('co-1');
  });
});
