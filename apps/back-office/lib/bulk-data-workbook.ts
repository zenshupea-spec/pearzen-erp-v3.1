import * as XLSX from 'xlsx';

import type { RankPayEntry } from '../../../packages/rank-pay-matrix';

export const EMPLOYEE_BULK_COLUMNS = [
  'employee_id',
  'emp_number',
  'full_name',
  'nic',
  'passport_no',
  'epf_no',
  'phone',
  'dob',
  'gender',
  'nationality',
  'religion',
  'home_address',
  'role',
  'group',
  'rank',
  'site',
  'date_joined',
  'status',
  'base_salary',
  'salary_type',
  'epf_yn',
  'bank_code',
  'bank_name',
  'branch_code',
  'account_number',
  'mod_expiry',
  'police_expiry',
  'maternity_leave',
] as const;

export const SITE_BULK_COLUMNS = [
  'site_id',
  'site_name',
  'site_type',
  'address',
  'required_guards',
  'assigned_sm_epf',
  'latitude',
  'longitude',
  'geofence_radius_m',
  'verification_mode',
  'provides_food',
  'food_allowance_lkr',
  'provides_accommodation',
  'nfc_tag_id',
] as const;

export const SM_GUARD_LINK_COLUMNS = ['sm_epf', 'guard_epf'] as const;

export const RANK_MATRIX_COLUMNS = [
  'rank_code',
  'full_title',
  'basic_pay',
  'salary_type',
  'operational_group',
  'annual_increment',
] as const;

const EXAMPLE_EMPLOYEE: Record<string, string | number | boolean> = {
  employee_id: '',
  emp_number: 'G-001',
  full_name: 'PERERA K.A.N.',
  nic: '199412345678',
  passport_no: '',
  epf_no: 'EPF-G001',
  phone: '+94771234567',
  dob: '1990-05-15',
  gender: 'MALE',
  nationality: 'SRI LANKAN',
  religion: 'BUDDHIST',
  home_address: 'NO 12, TEMPLE ROAD, NUGEGODA',
  role: 'SECURITY OFFICER',
  group: 'GUARD',
  rank: 'JSO',
  site: 'Lanka Hospitals',
  date_joined: '2024-01-15',
  status: 'ACTIVE',
  base_salary: 42000,
  salary_type: 'BANK',
  epf_yn: true,
  bank_code: '7056',
  bank_name: 'COMMERCIAL BANK',
  branch_code: '052',
  account_number: '8001234567',
  mod_expiry: '2027-06-30',
  police_expiry: '2027-12-31',
  maternity_leave: false,
};

const EXAMPLE_SITE: Record<string, string | number | boolean> = {
  site_id: '',
  site_name: 'Lanka Hospitals — Main Gate',
  site_type: 'HOTEL',
  address: 'NO 578, ELVitigala MAWATHA, COLOMBO 05',
  required_guards: 2,
  assigned_sm_epf: 'SM-001',
  latitude: 6.9105,
  longitude: 79.8648,
  geofence_radius_m: 25,
  verification_mode: 'B',
  provides_food: false,
  food_allowance_lkr: 0,
  provides_accommodation: false,
  nfc_tag_id: '',
};

function pickColumns<T extends readonly string[]>(
  columns: T,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of columns) {
    const v = row[key];
    if (v === null || v === undefined) out[key] = '';
    else if (typeof v === 'boolean') out[key] = v ? 'TRUE' : 'FALSE';
    else out[key] = v;
  }
  return out;
}

function sheetFromRows(name: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  return { name: name.slice(0, 31), ws };
}

function instructionsSheet(): XLSX.WorkSheet {
  const lines = [
    ['Pearzen ERP — Bulk data workbook'],
    [''],
    ['How to use'],
    ['1. Download the blank template to onboard new employees, sites, and SM links in one file.'],
    ['2. Download the live export to edit existing records, then re-upload to validate and save.'],
    ['3. Keep one row per employee on the Employees sheet — all MNR fields (personal, employment, bank, vetting) are columns.'],
    ['4. Sites sheet must use unique site_name values; match names exactly on employee site assignments.'],
    ['5. Rank codes must exist on Rank_Matrix (configure ranks in MD Settings first).'],
    ['6. verification_mode: A = NFC, B = GPS geofence, C = manual override.'],
    ['7. group values: GUARD | SECTOR_MANAGER | HEAD_OFFICE | CAFE | GUARD_FIELD'],
    ['8. status: ACTIVE | Resigned (case as stored in MNR)'],
    ['9. salary_type: BANK | CASH'],
    ['10. Document scans (NIC, MoD, police, etc.) are uploaded separately in HR MNR — not in this file.'],
    [''],
    ['Sheets'],
    ['Employees — master nominal roll bulk rows'],
    ['Sites — site_profiles for OM / SM / geofence'],
    ['SM_Guard_Links — sm_guard_assignments (sm_epf + guard_epf)'],
    ['Rank_Matrix — reference only (edit ranks in Settings UI)'],
    ['Lookups — allowed enum values'],
  ];
  return XLSX.utils.aoa_to_sheet(lines);
}

function lookupsSheet(): Record<string, unknown>[] {
  return [
    { field: 'group', allowed_values: 'GUARD, SECTOR_MANAGER, HEAD_OFFICE, CAFE, GUARD_FIELD' },
    { field: 'operational_group', allowed_values: 'HEAD_OFFICE, GUARD_FIELD, CAFE, SECTOR_MANAGER' },
    { field: 'site_type', allowed_values: 'OFFICE, BANK, PHARMACY, STORAGE, HOTEL, RESIDENTIAL, OTHER' },
    { field: 'verification_mode', allowed_values: 'A, B, C' },
    { field: 'salary_type', allowed_values: 'BANK, CASH' },
    { field: 'gender', allowed_values: 'MALE, FEMALE' },
    { field: 'epf_yn', allowed_values: 'TRUE, FALSE' },
    { field: 'status', allowed_values: 'ACTIVE, Resigned' },
  ];
}

export type BulkWorkbookInput = {
  mode: 'template' | 'export';
  employees: Record<string, unknown>[];
  sites: Record<string, unknown>[];
  smGuardLinks: Record<string, unknown>[];
  rankMatrix: RankPayEntry[];
};

export function buildBulkDataWorkbook(input: BulkWorkbookInput): {
  base64: string;
  filename: string;
} {
  const { mode, employees, sites, smGuardLinks, rankMatrix } = input;

  const employeeRows =
    mode === 'template'
      ? [pickColumns(EMPLOYEE_BULK_COLUMNS, EXAMPLE_EMPLOYEE)]
      : employees.map((e) => pickColumns(EMPLOYEE_BULK_COLUMNS, e));

  const siteRows =
    mode === 'template'
      ? [pickColumns(SITE_BULK_COLUMNS, EXAMPLE_SITE)]
      : sites.map((s) => pickColumns(SITE_BULK_COLUMNS, s));

  const linkRows =
    mode === 'template'
      ? [{ sm_epf: 'SM-001', guard_epf: 'G-001' }]
      : smGuardLinks;

  const rankRows = rankMatrix.map((r) =>
    pickColumns(RANK_MATRIX_COLUMNS, {
      rank_code: r.rankCode,
      full_title: r.fullTitle,
      basic_pay: r.basicPay,
      salary_type: r.salaryType,
      operational_group: r.operationalGroup,
      annual_increment: r.annualIncrement,
    }),
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, instructionsSheet(), 'Instructions');
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows('Employees', employeeRows).ws,
    'Employees',
  );
  XLSX.utils.book_append_sheet(wb, sheetFromRows('Sites', siteRows).ws, 'Sites');
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows('SM_Guard_Links', linkRows).ws,
    'SM_Guard_Links',
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows('Rank_Matrix', rankRows).ws,
    'Rank_Matrix',
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows('Lookups', lookupsSheet()).ws,
    'Lookups',
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const filename =
    mode === 'template'
      ? `pearzen-bulk-import-template-${stamp}.xlsx`
      : `pearzen-bulk-export-${stamp}.xlsx`;

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  return { base64, filename };
}
