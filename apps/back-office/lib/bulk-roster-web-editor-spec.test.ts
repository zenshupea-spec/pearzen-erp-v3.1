import { describe, expect, it } from 'vitest';

import {
  WEB_EDITOR_CAFE_COLUMNS,
  WEB_EDITOR_HEAD_OFFICE_COLUMNS,
  WEB_EDITOR_LOCKED_RANK_CODES,
  WEB_EDITOR_SECTOR_NAME_COLUMN,
  WEB_EDITOR_TAB_META,
  WEB_EDITOR_TAB_ORDER,
  columnGroupForWebEditorColumn,
  columnsForWebEditorTab,
  isHeadOfficeSectorNameActive,
  isHeadOfficeSectorNameRequired,
  isWebEditorLockedRank,
} from './bulk-roster-web-editor-spec';

describe('bulk-roster-web-editor-spec', () => {
  it('defines tab order Head Office → Café → Sites → Guards → Ranks', () => {
    expect(WEB_EDITOR_TAB_ORDER).toEqual([
      'head_office',
      'cafe',
      'sites',
      'guard',
      'ranks',
    ]);
    expect(WEB_EDITOR_TAB_META.head_office.label).toBe('Head Office');
    expect(WEB_EDITOR_TAB_META.guard.label).toBe('Guards');
  });

  it('includes sector_name on Head Office and Sites only', () => {
    expect(WEB_EDITOR_HEAD_OFFICE_COLUMNS).toContain(WEB_EDITOR_SECTOR_NAME_COLUMN);
    expect(columnsForWebEditorTab('sites')).toContain(WEB_EDITOR_SECTOR_NAME_COLUMN);
    expect(WEB_EDITOR_CAFE_COLUMNS).not.toContain(WEB_EDITOR_SECTOR_NAME_COLUMN);
    expect(columnsForWebEditorTab('guard')).not.toContain(WEB_EDITOR_SECTOR_NAME_COLUMN);
  });

  it('activates sector_name only for Head Office SM rows', () => {
    expect(isHeadOfficeSectorNameActive({ rank: 'SM' })).toBe(true);
    expect(isHeadOfficeSectorNameActive({ rank: 'GAD' })).toBe(false);
    expect(
      isHeadOfficeSectorNameRequired({ rank: 'SM', sector_name: '' }),
    ).toBe(true);
    expect(
      isHeadOfficeSectorNameRequired({ rank: 'SM', sector_name: 'COLOMBO 1' }),
    ).toBe(false);
    expect(
      isHeadOfficeSectorNameRequired({ rank: 'GAD', sector_name: '' }),
    ).toBe(false);
  });

  it('locks MD, OD, FM, and SM ranks in the editor', () => {
    expect(WEB_EDITOR_LOCKED_RANK_CODES).toEqual(['MD', 'OD', 'FM', 'SM']);
    expect(isWebEditorLockedRank('md')).toBe(true);
    expect(isWebEditorLockedRank('OD')).toBe(true);
    expect(isWebEditorLockedRank('FM')).toBe(true);
    expect(isWebEditorLockedRank('SM')).toBe(true);
    expect(isWebEditorLockedRank('OIC')).toBe(false);
  });

  it('maps sector_name to placement colour group', () => {
    expect(columnGroupForWebEditorColumn('head_office', WEB_EDITOR_SECTOR_NAME_COLUMN)).toBe(
      'placement',
    );
    expect(columnGroupForWebEditorColumn('sites', WEB_EDITOR_SECTOR_NAME_COLUMN)).toBe(
      'placement',
    );
  });

  it('maps migration sheet names for workforce tabs', () => {
    expect(WEB_EDITOR_TAB_META.head_office.migrationSheetName).toBe('HEAD_OFFICE');
    expect(WEB_EDITOR_TAB_META.cafe.migrationSheetName).toBe('CAFE');
    expect(WEB_EDITOR_TAB_META.sites.migrationSheetName).toBe('Sites');
    expect(WEB_EDITOR_TAB_META.guard.migrationSheetName).toBe('GUARD');
    expect(WEB_EDITOR_TAB_META.ranks.migrationSheetName).toBeUndefined();
  });

  it('derives column lists per tab from migration workbook columns', () => {
    expect(columnsForWebEditorTab('head_office')).toEqual(WEB_EDITOR_HEAD_OFFICE_COLUMNS);
    expect(columnsForWebEditorTab('cafe')).toEqual(WEB_EDITOR_CAFE_COLUMNS);
    expect(columnsForWebEditorTab('guard')).toContain('site_code');
    expect(columnsForWebEditorTab('guard')).toContain('assigned_sm_epf');
    expect(columnsForWebEditorTab('sites')).toContain('site_code');
    expect(columnsForWebEditorTab('ranks')).toEqual([
      'rank_id',
      'rank_code',
      'rank_title',
      'basic_pay_lkr',
      'salary_type',
      'operational_group',
    ]);
  });

  it('includes hr_memo on workforce tabs', () => {
    expect(columnsForWebEditorTab('head_office')).toContain('hr_memo');
    expect(columnsForWebEditorTab('cafe')).toContain('hr_memo');
    expect(columnsForWebEditorTab('guard')).toContain('hr_memo');
    expect(columnGroupForWebEditorColumn('guard', 'hr_memo')).toBe('memo');
  });

  it('maps workforce column keys to colour groups', () => {
    expect(columnGroupForWebEditorColumn('guard', 'full_name')).toBe('identity');
    expect(columnGroupForWebEditorColumn('guard', 'rank')).toBe('employment');
    expect(columnGroupForWebEditorColumn('guard', 'site_code')).toBe('placement');
    expect(columnGroupForWebEditorColumn('sites', 'site_code')).toBe('sites_identity');
    expect(columnGroupForWebEditorColumn('ranks', 'basic_pay_lkr')).toBe('employment');
  });
});
