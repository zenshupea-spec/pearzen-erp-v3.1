import { findRankPayEntry } from '../../../packages/rank-pay-matrix';
import type { RankPayEntry } from '../../../packages/rank-pay-matrix';
import { isSectorManagerEmployee } from './hr-sectors';

const GUARD_GROUPS = new Set(['GUARD', 'GUARD_FIELD']);
const FIELD_GUARD_RANK_CODES = new Set(['CSO', 'OIC', 'SSO', 'JSO', 'LSO']);

export type MnrPersonnelFilter =
  | 'ALL'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'TEMPORY'
  | 'RESIGNED'
  | 'VETTING_EXPIRING'
  | 'VETTING_EXPIRED';

export type MnrRosterSummaryRow = {
  id: string;
  full_name?: string | null;
  status?: string | null;
  site?: string | null;
  group?: string | null;
  rank?: string | null;
  maternity_leave?: boolean | null;
  nic?: string | null;
  passport_no?: string | null;
  epf_no?: string | number | null;
  epf_num?: string | number | null;
  emp_number?: string | null;
  date_joined?: string | null;
  grama_niladari_expiry?: string | null;
  nic_passport_doc_url?: string | null;
  police_clearance_url?: string | null;
  grama_niladari_url?: string | null;
};

function normStatus(emp: MnrRosterSummaryRow) {
  return (emp.status || '').trim();
}

function normalizeSiteName(emp: MnrRosterSummaryRow) {
  return (emp.site || '').trim().toUpperCase();
}

function normalizeCorporateGroup(value: unknown) {
  const v = String(value ?? '').trim().toUpperCase();
  if (v === 'GUARD_FIELD') return 'GUARD';
  return v;
}

function isGuardGroup(emp: MnrRosterSummaryRow) {
  return GUARD_GROUPS.has((emp.group || '').toUpperCase());
}

function isFieldGuardRank(matrix: RankPayEntry[], rank: string | null | undefined) {
  const code = (rank || '').trim().toUpperCase();
  const entry = findRankPayEntry(matrix, code);
  if (entry) {
    return entry.operationalGroup === 'GUARD_FIELD' || entry.operationalGroup === 'GUARD';
  }
  return FIELD_GUARD_RANK_CODES.has(code);
}

export function isGuardEmployee(emp: MnrRosterSummaryRow, matrix: RankPayEntry[] = []) {
  if (isGuardGroup(emp)) return true;
  return isFieldGuardRank(matrix, emp.rank);
}

export function isHrActive(emp: MnrRosterSummaryRow) {
  return normStatus(emp).toUpperCase() === 'ACTIVE';
}

export function isResigned(emp: MnrRosterSummaryRow) {
  return normStatus(emp).toLowerCase() === 'resigned' || normalizeSiteName(emp) === 'CLEARANCE';
}

function isOnMaternityLeave(emp: MnrRosterSummaryRow) {
  return Boolean(emp.maternity_leave) && !isGuardGroup(emp);
}

function isReserveBenchSite(emp: MnrRosterSummaryRow) {
  return normalizeSiteName(emp) === 'RESERVE';
}

function isClearanceSite(emp: MnrRosterSummaryRow) {
  return normalizeSiteName(emp) === 'CLEARANCE';
}

function isTemporySite(emp: MnrRosterSummaryRow) {
  return normalizeSiteName(emp) === 'TEMPORY';
}

function isDeployedClientSite(emp: MnrRosterSummaryRow) {
  if (!isHrActive(emp)) return false;
  const site = normalizeSiteName(emp);
  if (!site || site === 'RESERVE' || site === 'CLEARANCE' || site === 'TEMPORY' || site === 'HEAD OFFICE') {
    return false;
  }
  return true;
}

function isHqRosterActive(emp: MnrRosterSummaryRow) {
  if (!isHrActive(emp)) return false;
  const group = normalizeCorporateGroup(emp?.group);
  return group === 'HEAD_OFFICE' || group === 'CAFE';
}

function isSectorManagerRosterActive(emp: MnrRosterSummaryRow) {
  return isHrActive(emp) && isSectorManagerEmployee(emp);
}

export function isOperationalActive(emp: MnrRosterSummaryRow, matrix: RankPayEntry[] = []) {
  if (isResigned(emp) || isClearanceSite(emp)) return false;
  if (!isHrActive(emp)) return false;
  if (isOnMaternityLeave(emp)) return true;
  if (isSectorManagerRosterActive(emp)) return true;
  if (isHqRosterActive(emp)) return true;
  if (!isGuardEmployee(emp, matrix)) return false;
  if (isReserveBenchSite(emp) || isTemporySite(emp)) return false;
  return isDeployedClientSite(emp);
}

export function isOperationalInactive(emp: MnrRosterSummaryRow, matrix: RankPayEntry[] = []) {
  if (isResigned(emp) || isClearanceSite(emp) || !isHrActive(emp)) return false;
  if (isOnMaternityLeave(emp)) return false;
  if (!isGuardEmployee(emp, matrix)) return false;
  return isReserveBenchSite(emp);
}

export function isOperationalTempory(emp: MnrRosterSummaryRow, matrix: RankPayEntry[] = []) {
  if (isResigned(emp) || !isHrActive(emp)) return false;
  if (!isGuardEmployee(emp, matrix)) return false;
  return isTemporySite(emp);
}

function daysUntilExpiry(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function hasHrDocument(emp: MnrRosterSummaryRow, column: keyof MnrRosterSummaryRow) {
  const value = emp[column];
  if (value == null || value === '') return false;
  return String(value).trim().length > 0;
}

function gramaNiladariVettingState(emp) {
  if (!hasHrDocument(emp, 'grama_niladari_url')) return null;
  const days = daysUntilExpiry(emp.grama_niladari_expiry);
  if (days === null) return null;
  if (days < 0) return 'expired';
  if (days <= 45) return 'expiring';
  return null;
}

function vettingBucket(emp: MnrRosterSummaryRow) {
  return gramaNiladariVettingState(emp);
}

export function isVettingExpiring(emp: MnrRosterSummaryRow, matrix: RankPayEntry[] = []) {
  return (
    isOperationalActive(emp, matrix) &&
    isGuardEmployee(emp, matrix) &&
    vettingBucket(emp) === 'expiring'
  );
}

export function isVettingExpired(emp: MnrRosterSummaryRow, matrix: RankPayEntry[] = []) {
  return (
    isOperationalActive(emp, matrix) &&
    isGuardEmployee(emp, matrix) &&
    vettingBucket(emp) === 'expired'
  );
}

export function internalWorkforceGroup(emp: MnrRosterSummaryRow) {
  const v = String(emp?.group || '').trim().toUpperCase();
  if (v === 'HEAD_OFFICE' || v === 'CAFE') return v;
  return null;
}

export function isInternalWorkforceEmployee(emp: MnrRosterSummaryRow) {
  return internalWorkforceGroup(emp) !== null;
}

export function matchesMnrPersonnelFilter(
  emp: MnrRosterSummaryRow,
  filter: MnrPersonnelFilter,
  matrix: RankPayEntry[] = [],
): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'ACTIVE') return isOperationalActive(emp, matrix);
  if (filter === 'INACTIVE') return isOperationalInactive(emp, matrix);
  if (filter === 'TEMPORY') return isOperationalTempory(emp, matrix);
  if (filter === 'RESIGNED') return isResigned(emp);
  if (filter === 'VETTING_EXPIRING') return isVettingExpiring(emp, matrix);
  if (filter === 'VETTING_EXPIRED') return isVettingExpired(emp, matrix);
  return true;
}

export function employeeEpfNo(emp: MnrRosterSummaryRow) {
  return emp.epf_no ?? emp.epf_num ?? emp.emp_number ?? null;
}

export function matchesMnrSearch(emp: MnrRosterSummaryRow, searchQuery: string) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  return (
    emp.full_name?.toLowerCase().includes(q) ||
    emp.nic?.toLowerCase().includes(q) ||
    employeeEpfNo(emp)?.toString().toLowerCase().includes(q) ||
    emp.passport_no?.toLowerCase().includes(q) ||
    emp.rank?.toLowerCase().includes(q) ||
    emp.site?.toLowerCase().includes(q)
  );
}

export function computeMnrPersonnelCounts(
  rows: MnrRosterSummaryRow[],
  matrix: RankPayEntry[],
  internalWorkforceOnly: boolean,
) {
  const pool = internalWorkforceOnly
    ? rows.filter(isInternalWorkforceEmployee)
    : rows;

  return {
    all: pool.length,
    active: pool.filter((e) => isOperationalActive(e, matrix)).length,
    inactive: pool.filter((e) => isOperationalInactive(e, matrix)).length,
    tempory: pool.filter((e) => isOperationalTempory(e, matrix)).length,
    resigned: pool.filter(isResigned).length,
    vettingExpiring: pool.filter((e) => isVettingExpiring(e, matrix)).length,
    vettingExpired: pool.filter((e) => isVettingExpired(e, matrix)).length,
  };
}
