'use client';

import { useMemo, useState } from 'react';
import { Building2, Loader2, RefreshCw, UserCheck, Users } from 'lucide-react';

import { useOmFieldData } from '../context/OmFieldDataContext';
import type { OmAllocationSite, OmAllocationSlot } from '../lib/field-operations-types';

function formatGuardOptionLabel(guard: {
  name: string;
  rank: string;
  epfNo: string;
}): string {
  return `${guard.rank} · ${guard.name} · EPF ${guard.epfNo}`;
}

function SiteAllocationCard({
  site,
  guardOptions,
  onSave,
}: {
  site: OmAllocationSite;
  guardOptions: { empNo: string; name: string; rank: string; epfNo: string }[];
  onSave: (site: OmAllocationSite, assignments: Record<string, string>) => Promise<void>;
}) {
  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const slot of site.slots) {
      initial[slot.slotId] = slot.currentEmpNo ?? '';
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const openSlots = site.slots.filter((slot) => !slot.currentEmpNo).length;

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(site, assignments);
      setMessage('Assignments saved.');
    } catch {
      setMessage('Save failed — check MNR and site records.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">{site.siteName}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {site.clientName} · {site.location}
          </p>
          {site.assignedSmEpf ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
              <UserCheck className="h-3 w-3 shrink-0" />
              SM ·{' '}
              {site.assignedSmName && site.assignedSmName !== site.assignedSmEpf
                ? `${site.assignedSmName} · EPF ${site.assignedSmEpf}`
                : `EPF ${site.assignedSmEpf}`}
            </p>
          ) : null}
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-black uppercase text-slate-600">
          {openSlots} open slot{openSlots === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-3">
        {site.slots.map((slot: OmAllocationSlot) => (
          <div key={slot.slotId} className="grid gap-2 sm:grid-cols-[1fr_minmax(260px,1fr)] sm:items-center">
            <div>
              <p className="text-xs font-bold text-slate-800">
                {slot.rank} · {slot.shiftType} shift
              </p>
              <p className="text-[10px] text-slate-500">{slot.label}</p>
            </div>
            <select
              value={assignments[slot.slotId] ?? ''}
              onChange={(e) =>
                setAssignments((prev) => ({ ...prev, [slot.slotId]: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800"
            >
              <option value="">— Unassigned —</option>
              {guardOptions.map((guard) => (
                <option key={guard.empNo} value={guard.empNo}>
                  {formatGuardOptionLabel(guard)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {message ? <p className="text-xs font-semibold text-emerald-700">{message}</p> : <span />}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-600 px-3 py-1.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save site
        </button>
      </div>
    </div>
  );
}

export default function SiteAllocationTab() {
  const {
    loading,
    error,
    guardPool,
    unassignedSites,
    allocatedSites,
    tacticalShorts,
    refresh,
    saveSiteAssignments,
  } = useOmFieldData();

  const guardOptions = useMemo(
    () =>
      guardPool.map((guard) => ({
        empNo: guard.empNo,
        epfNo: guard.epfNo,
        name: guard.name,
        rank: guard.rank,
      })),
    [guardPool],
  );

  const allSites = useMemo(
    () => [...unassignedSites, ...allocatedSites],
    [unassignedSites, allocatedSites],
  );

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-16 rounded-2xl bg-slate-100" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-48 rounded-2xl bg-slate-100" />
          <div className="h-48 rounded-2xl bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Live guard pool and site slots from MNR + <code className="text-xs">site_profiles</code>.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold uppercase text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Guard pool', value: guardPool.length, icon: Users },
          { label: 'Unassigned sites', value: unassignedSites.length, icon: Building2 },
          { label: 'Allocated sites', value: allocatedSites.length, icon: Building2 },
          { label: 'Under strength', value: tacticalShorts.length, icon: Building2 },
        ].map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
            <p className="text-2xl font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {allSites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-16 text-center">
          <Building2 className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700">No sites in the directory</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Register sites in the executive or FM site directory, then assign guards from the pool
            here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {allSites.map((site) => (
            <SiteAllocationCard
              key={site.siteId}
              site={site}
              guardOptions={guardOptions}
              onSave={async (target, assignments) => {
                const result = await saveSiteAssignments({
                  siteId: target.siteId,
                  siteName: target.siteName,
                  slotAssignments: assignments,
                  slots: target.slots.map((slot) => ({
                    slotId: slot.slotId,
                    currentEmpNo: slot.currentEmpNo,
                  })),
                });
                if (!result.success) {
                  throw new Error(result.error);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
