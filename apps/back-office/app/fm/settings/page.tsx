'use client';

import React, { useEffect, useState } from 'react';
import FmSubnav from '../components/FmSubnav';
import FmCommandShellLayout from '../components/FmCommandShellLayout';
import {
  ExecutivePageBody,
  ExecutivePageHeader,
  ExecutivePageLiveSubtitle,
  ExecutivePageShell,
} from '../../../components/executive/ExecutivePageChrome';
import {
  FM_HOLIDAY_CALENDAR_DEFAULTS,
  isHolidayCalendarIncomplete,
  type FmHolidayCalendarEntry,
} from '../../../lib/fm-holiday-calendar';
import {
  getFmHolidayCalendarStatus,
  saveFmHolidayCalendar,
} from '../holiday-calendar-actions';
import { notifyFmHolidayCalendarUpdated } from '../use-fm-holiday-calendar-incomplete';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Flag,
  Plus,
  Save,
  Scale,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';

type HolidayEntry = FmHolidayCalendarEntry;

export default function FMSettingsPage() {
  const [holidayEntries, setHolidayEntries] = useState<HolidayEntry[]>(
    FM_HOLIDAY_CALENDAR_DEFAULTS,
  );
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayLabel, setNewHolidayLabel] = useState('');
  const [newHolidayType, setNewHolidayType] = useState<HolidayEntry['type']>('POYA');
  const [holidayCalSaved, setHolidayCalSaved] = useState(false);
  const [holidayCalSaving, setHolidayCalSaving] = useState(false);
  const [holidayCalError, setHolidayCalError] = useState<string | null>(null);

  useEffect(() => {
    void getFmHolidayCalendarStatus().then((status) => {
      if (status.ok && status.entries.length > 0) {
        setHolidayEntries(status.entries);
      }
    });
  }, []);

  const addHolidayEntry = () => {
    if (!newHolidayDate || !newHolidayLabel.trim()) return;
    setHolidayEntries((prev) => [
      ...prev,
      { id: `h-${Date.now()}`, date: newHolidayDate, label: newHolidayLabel.trim(), type: newHolidayType },
    ]);
    setNewHolidayDate('');
    setNewHolidayLabel('');
    setNewHolidayType('POYA');
    setShowHolidayModal(false);
  };

  const removeHolidayEntry = (id: string) =>
    setHolidayEntries((prev) => prev.filter((e) => e.id !== id));

  const saveHolidayCalendar = async () => {
    setHolidayCalSaving(true);
    setHolidayCalError(null);
    const result = await saveFmHolidayCalendar(holidayEntries);
    setHolidayCalSaving(false);
    if (!result.success) {
      setHolidayCalError(result.error);
      return;
    }
    notifyFmHolidayCalendarUpdated(result.incomplete);
    setHolidayCalSaved(true);
    setTimeout(() => setHolidayCalSaved(false), 2500);
  };

  const holidayCalendarIncomplete = isHolidayCalendarIncomplete(holidayEntries);
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  const latestPoya = holidayEntries
    .filter((entry) => entry.type === 'POYA')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestStatutory = holidayEntries
    .filter((entry) => entry.type === 'STATUTORY' || entry.type === 'PUBLIC_HOLIDAY')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const poyaFilled =
    latestPoya != null && new Date(`${latestPoya.date}T12:00:00`) >= oneYearFromNow;
  const statutoryFilled =
    latestStatutory != null &&
    new Date(`${latestStatutory.date}T12:00:00`) >= oneYearFromNow;

  return (
    <FmCommandShellLayout className="py-0 sm:py-0 lg:py-0">
      <div className="pt-8">
        <FmSubnav holidayCalendarIncomplete={holidayCalendarIncomplete} />
      </div>

      <ExecutivePageShell>
        <ExecutivePageHeader
          title="Holiday Calendar"
          subtitle={
            <ExecutivePageLiveSubtitle>
              Poya, statutory, and public holiday dates for payroll
            </ExecutivePageLiveSubtitle>
          }
        />

        <ExecutivePageBody spacing="relaxed">
          <div id="holiday-calendar">
            <ExecutiveGlassCard className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
                    <CalendarDays className="h-5 w-5 text-rose-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">
                      Finance &amp; Compensation — Holiday Calendar
                    </h3>
                    <p className="text-sm font-medium text-slate-600">
                      Enter Poya, statutory, and public holiday dates. Applied globally across all payroll
                      calculations.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {holidayCalSaved && (
                    <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                      <CalendarCheck className="h-3.5 w-3.5" />
                      Calendar saved
                    </span>
                  )}
                  {holidayCalendarIncomplete && (
                    <span className="flex items-center gap-1.5 rounded-xl border border-red-200/80 bg-red-50/80 px-3 py-1.5 text-sm font-bold text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Dates not filled for 1 year ahead
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-5 p-6">
                {holidayCalendarIncomplete && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/70 px-5 py-4">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
                    <div>
                      <p className="text-sm font-black text-red-800">
                        Action Required — Holiday Calendar Incomplete
                      </p>
                      <p className="mt-1 text-sm font-semibold text-red-700">
                        {!poyaFilled && !statutoryFilled
                          ? 'Poya dates and statutory / public holiday dates must be entered at least 1 year ahead.'
                          : !poyaFilled
                            ? 'Poya dates must be entered at least 1 year ahead.'
                            : 'Statutory / public holiday dates must be entered at least 1 year ahead.'}{' '}
                        The payroll engine cannot accurately calculate holiday premiums without this data.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-sm font-black uppercase tracking-widest text-slate-500">
                    Configured Dates ({holidayEntries.length})
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowHolidayModal(true)}
                    className="flex items-center gap-2 rounded-xl border border-rose-200/80 bg-rose-50/80 px-4 py-2 text-sm font-bold text-rose-700 transition-all hover:bg-rose-100"
                  >
                    <CalendarPlus className="h-4 w-4" />
                    Add Holiday Date
                  </button>
                </div>

                {showHolidayModal && (
                  <div className="space-y-4 rounded-2xl border border-rose-200/80 bg-rose-50/40 p-5">
                    <p className="text-sm font-black uppercase tracking-widest text-rose-700">
                      New Holiday Entry
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
                          Date
                        </label>
                        <input
                          type="date"
                          value={newHolidayDate}
                          onChange={(e) => setNewHolidayDate(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
                          Label / Name
                        </label>
                        <input
                          type="text"
                          value={newHolidayLabel}
                          onChange={(e) => setNewHolidayLabel(e.target.value)}
                          placeholder="e.g. Esala Poya"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
                          Type
                        </label>
                        <select
                          value={newHolidayType}
                          onChange={(e) => setNewHolidayType(e.target.value as HolidayEntry['type'])}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                        >
                          <option value="POYA">Poya Day</option>
                          <option value="STATUTORY">Statutory Holiday</option>
                          <option value="PUBLIC_HOLIDAY">Public Holiday</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={addHolidayEntry}
                        disabled={!newHolidayDate || !newHolidayLabel.trim()}
                        className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-sm font-bold text-white transition-all hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowHolidayModal(false);
                          setNewHolidayDate('');
                          setNewHolidayLabel('');
                        }}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {(['POYA', 'STATUTORY', 'PUBLIC_HOLIDAY'] as const).map((type) => {
                  const entries = holidayEntries
                    .filter((e) => e.type === type)
                    .sort((a, b) => a.date.localeCompare(b.date));
                  const typeLabel =
                    type === 'POYA'
                      ? 'Poya Days'
                      : type === 'STATUTORY'
                        ? 'Statutory Holidays'
                        : 'Public Holidays';
                  const typeBadge =
                    type === 'POYA'
                      ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                      : type === 'STATUTORY'
                        ? 'border-purple-200 bg-purple-50 text-purple-700'
                        : 'border-red-200 bg-red-50 text-red-700';
                  const TypeIcon = type === 'POYA' ? Star : type === 'STATUTORY' ? Scale : Flag;

                  return (
                    <div
                      key={type}
                      className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/60"
                    >
                      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                        <TypeIcon className="h-4 w-4 text-slate-500" />
                        <span className="text-sm font-black uppercase tracking-widest text-slate-600">
                          {typeLabel}
                        </span>
                        <span
                          className={`ml-auto inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold ${typeBadge}`}
                        >
                          {entries.length} date{entries.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {entries.length === 0 ? (
                        <p className="px-5 py-4 text-sm font-semibold italic text-slate-400">
                          No dates configured yet.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {entries.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-slate-50"
                            >
                              <div className="flex items-center gap-3">
                                <CalendarCheck className="h-4 w-4 flex-shrink-0 text-slate-400" />
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{entry.label}</p>
                                  <p className="text-xs font-mono font-semibold text-slate-500">
                                    {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-LK', {
                                      weekday: 'short',
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                    })}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeHolidayEntry(entry.id)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-200/60 bg-slate-50/60 px-6 py-4">
                <p className="text-xs font-semibold text-slate-500">
                  These dates are shared globally — all payroll calculations for Poya, statutory, and public
                  holiday premiums reference this calendar.
                </p>
                {holidayCalError && (
                  <p className="text-xs font-semibold text-red-600">{holidayCalError}</p>
                )}
                <button
                  type="button"
                  onClick={() => void saveHolidayCalendar()}
                  disabled={holidayCalSaving}
                  className="flex items-center gap-2 rounded-2xl bg-rose-600 px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-rose-600/25 transition-all hover:bg-rose-500 disabled:cursor-wait disabled:opacity-70"
                >
                  <Save className="h-4 w-4" />
                  {holidayCalSaving ? 'Saving…' : 'Save Calendar'}
                </button>
              </div>
            </ExecutiveGlassCard>
          </div>
        </ExecutivePageBody>
      </ExecutivePageShell>
    </FmCommandShellLayout>
  );
}
