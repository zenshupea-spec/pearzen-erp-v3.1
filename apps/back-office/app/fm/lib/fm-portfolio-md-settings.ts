import {
  DEFAULT_RANK_PAY_MATRIX,
  ensureSystemLedgerRanks,
  parseRankPayMatrix,
  type RankPayEntry,
} from '../../../../../packages/rank-pay-matrix';
import {
  isMissingColumnError,
  MD_SETTINGS_ENVELOPE_KEYS,
  parseSettingEnvelope,
} from '../../../../../packages/supabase/md-settings-envelope';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import type { PayrollWorkingDaysSettings } from '../../executive/settings/actions';
import {
  parseMdEngineConstants,
  type MdEngineConstants,
} from '../../executive/settings/engine-constants';
import {
  parseHolidayCalendarEntries,
  type FmHolidayCalendarEntry,
} from '../../../lib/fm-holiday-calendar';

const DEFAULT_PAYROLL_WORKING_DAYS: PayrollWorkingDaysSettings = {
  wbWorkingDays: 26,
  wbHours: 200,
  soWorkingDays: 20,
};

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

type MdSettingsRow = {
  rank_pay_matrix?: unknown;
  setting_value?: unknown;
  wb_working_days?: unknown;
  wb_hours?: unknown;
  so_working_days?: unknown;
  holiday_calendar?: unknown;
};

function rankPayMatrixFromRow(row: MdSettingsRow | null): RankPayEntry[] {
  if (!row) return ensureSystemLedgerRanks([]);

  if (Array.isArray(row.rank_pay_matrix)) {
    if (row.rank_pay_matrix.length === 0) return ensureSystemLedgerRanks([]);
    return ensureSystemLedgerRanks(parseRankPayMatrix(row.rank_pay_matrix));
  }

  const envelope = parseSettingEnvelope(row.setting_value);
  const fromEnvelope = envelope[MD_SETTINGS_ENVELOPE_KEYS.rankPayMatrix];
  if (Array.isArray(fromEnvelope)) {
    if (fromEnvelope.length === 0) return ensureSystemLedgerRanks([]);
    return ensureSystemLedgerRanks(parseRankPayMatrix(fromEnvelope));
  }

  return ensureSystemLedgerRanks(DEFAULT_RANK_PAY_MATRIX);
}

function workingDaysFromRow(row: MdSettingsRow | null): PayrollWorkingDaysSettings {
  if (!row) return DEFAULT_PAYROLL_WORKING_DAYS;
  return {
    wbWorkingDays: num(row.wb_working_days, DEFAULT_PAYROLL_WORKING_DAYS.wbWorkingDays),
    wbHours: num(row.wb_hours, DEFAULT_PAYROLL_WORKING_DAYS.wbHours),
    soWorkingDays: num(row.so_working_days, DEFAULT_PAYROLL_WORKING_DAYS.soWorkingDays),
  };
}

function holidayCalendarFromRow(row: MdSettingsRow | null): FmHolidayCalendarEntry[] {
  if (!row) return [];

  if (Array.isArray(row.holiday_calendar)) {
    return parseHolidayCalendarEntries(row.holiday_calendar);
  }

  const envelope = parseSettingEnvelope(row.setting_value);
  return parseHolidayCalendarEntries(envelope[MD_SETTINGS_ENVELOPE_KEYS.holidayCalendar]);
}

function engineConstantsFromRow(row: MdSettingsRow | null): MdEngineConstants {
  const envelope = parseSettingEnvelope(row?.setting_value);
  const raw = envelope[MD_SETTINGS_ENVELOPE_KEYS.engineConstants] as
    | Partial<MdEngineConstants>
    | undefined;
  return parseMdEngineConstants(raw);
}

export type FmPortfolioMdSettingsBundle = {
  rankMatrix: RankPayEntry[];
  engineConstants: MdEngineConstants;
  workingDaysSettings: PayrollWorkingDaysSettings;
  holidayCalendar: FmHolidayCalendarEntry[];
};

/** Single md_settings round-trip for FM portfolio (replaces 4 parallel settings fetches). */
export async function fetchFmPortfolioMdSettingsBundle(
  companyId: string,
): Promise<FmPortfolioMdSettingsBundle> {
  const supabase = createSupabaseServiceClient();

  let { data, error } = await supabase
    .from('md_settings')
    .select(
      'rank_pay_matrix, setting_value, wb_working_days, wb_hours, so_working_days, holiday_calendar',
    )
    .eq('company_id', companyId)
    .maybeSingle();

  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await supabase
      .from('md_settings')
      .select('setting_value')
      .eq('company_id', companyId)
      .maybeSingle());
  }

  if (error) {
    console.error('fetchFmPortfolioMdSettingsBundle:', error.message);
  }

  const row = (data as MdSettingsRow | null) ?? null;

  return {
    rankMatrix: rankPayMatrixFromRow(row),
    engineConstants: engineConstantsFromRow(row),
    workingDaysSettings: workingDaysFromRow(row),
    holidayCalendar: holidayCalendarFromRow(row),
  };
}
