'use server';

import { unstable_noStore as noStore } from 'next/cache';

import {
  isHolidayCalendarIncomplete,
  parseHolidayCalendarEntries,
  sanitizeHolidayCalendarEntries,
  type FmHolidayCalendarEntry,
} from '../../lib/fm-holiday-calendar';
import {
  isMissingColumnError,
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
  mergeSettingEnvelope,
  parseSettingEnvelope,
} from '../../../../packages/supabase/md-settings-envelope';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import { revalidateMdSettingsConsumers } from '../executive/settings/lib/revalidate-md-settings-consumers';
import { requireFmPortfolioRead, requireFmPortfolioWrite } from './lib/fm-portfolio-auth-server';

export async function loadFmHolidayCalendarForCompany(
  companyId: string,
): Promise<FmHolidayCalendarEntry[]> {
  const supabase = createSupabaseServiceClient();

  let { data, error } = await supabase
    .from('md_settings')
    .select('holiday_calendar, setting_value')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error && isMissingColumnError(error.message)) {
    const envelope = await loadSettingEnvelope(supabase, companyId);
    return parseHolidayCalendarEntries(envelope[MD_SETTINGS_ENVELOPE_KEYS.holidayCalendar]);
  }

  if (error) {
    console.error('loadHolidayCalendarForCompany:', error.message);
    return [];
  }

  const row = data as { holiday_calendar?: unknown; setting_value?: unknown } | null;
  const fromColumn = parseHolidayCalendarEntries(row?.holiday_calendar);
  if (fromColumn.length > 0) return fromColumn;

  const envelope = parseSettingEnvelope(row?.setting_value);
  return parseHolidayCalendarEntries(envelope[MD_SETTINGS_ENVELOPE_KEYS.holidayCalendar]);
}

export async function getFmHolidayCalendarStatus(): Promise<
  | { ok: true; entries: FmHolidayCalendarEntry[]; incomplete: boolean }
  | { ok: false; error: string }
> {
  noStore();
  try {
    const { companyId } = await requireFmPortfolioRead();
    const entries = await loadFmHolidayCalendarForCompany(companyId);
    return {
      ok: true,
      entries,
      incomplete: isHolidayCalendarIncomplete(entries),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load holiday calendar.';
    return { ok: false, error: message };
  }
}

export async function saveFmHolidayCalendar(
  entries: FmHolidayCalendarEntry[],
): Promise<{ success: true; incomplete: boolean } | { success: false; error: string }> {
  try {
    const { companyId } = await requireFmPortfolioWrite();
    const supabase = createSupabaseServiceClient();
    const sanitized = sanitizeHolidayCalendarEntries(entries);

    let { error } = await supabase.from('md_settings').upsert(
      { company_id: companyId, holiday_calendar: sanitized },
      { onConflict: 'company_id' },
    );

    if (error && isMissingColumnError(error.message)) {
      const res = await mergeSettingEnvelope(supabase, companyId, {
        [MD_SETTINGS_ENVELOPE_KEYS.holidayCalendar]: sanitized,
      });
      if (!res.success) return { success: false, error: res.error ?? 'Save failed.' };
    } else if (error) {
      return { success: false, error: error.message };
    }

    revalidateMdSettingsConsumers();
    return {
      success: true,
      incomplete: isHolidayCalendarIncomplete(sanitized),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save holiday calendar.';
    return { success: false, error: message };
  }
}
