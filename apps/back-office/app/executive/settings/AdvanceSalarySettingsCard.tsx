'use client';

import { useEffect, useState } from 'react';
import { Banknote } from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { ExecutivePageLoading } from '../../../components/executive/ExecutivePageChrome';
import {
  getAdvanceSalarySettings,
  saveAdvanceSalarySettings,
} from './advance-salary-actions';
import {
  DEFAULT_ADVANCE_SALARY_SETTINGS,
  type AdvanceSalarySettings,
} from '../../../../../packages/advance-salary';

export default function AdvanceSalarySettingsCard() {
  const [settings, setSettings] = useState<AdvanceSalarySettings>(DEFAULT_ADVANCE_SALARY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getAdvanceSalarySettings()
      .then((cfg) => {
        if (!cancelled) setSettings(cfg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    const result = await saveAdvanceSalarySettings(settings);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Could not save advance salary caps.');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/70 bg-amber-50/40 px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-100/80">
            <Banknote className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Advance Salary Caps</h3>
            <p className="mt-1 text-sm text-slate-600">
              FM and HR advance requests are rejected server-side when they exceed these MD limits.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving}
          className="rounded-xl border border-amber-300 bg-amber-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-amber-500 disabled:opacity-60"
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save caps'}
        </button>
      </div>

      {loading ? (
        <ExecutivePageLoading
          message="Loading advance rules…"
          className="min-h-[8rem] py-6"
        />
      ) : (
        <div className="grid gap-6 p-6 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-widest text-slate-500">
              Guard minimum shifts
            </span>
            <input
              type="number"
              min={1}
              max={31}
              value={settings.guardMinShifts}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  guardMinShifts: Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)),
                }))
              }
              className="mt-2 w-full rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 font-mono text-sm font-black text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-black uppercase tracking-widest text-slate-500">
              Guard max advance (LKR)
            </span>
            <input
              type="number"
              min={0}
              value={settings.guardMaxAdvanceLkr}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  guardMaxAdvanceLkr: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
              className="mt-2 w-full rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 font-mono text-sm font-black text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-black uppercase tracking-widest text-slate-500">
              Other staff max advance (LKR)
            </span>
            <input
              type="number"
              min={0}
              value={settings.otherEmployeeMaxAdvanceLkr}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  otherEmployeeMaxAdvanceLkr: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
              className="mt-2 w-full rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 font-mono text-sm font-black text-slate-900"
            />
          </label>
        </div>
      )}

      {error && (
        <p className="px-6 pb-4 text-sm font-semibold text-rose-700">{error}</p>
      )}
    </ExecutiveGlassCard>
  );
}
