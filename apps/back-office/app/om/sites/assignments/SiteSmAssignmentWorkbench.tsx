'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import {
  assignSiteToSectorManager,
  clearSiteSectorManager,
  getSectorManagersForAssignment,
  getSitesPendingSmAssignment,
  getSitesWithSmAssigned,
  type OmSiteRecord,
  type SectorManagerOption,
} from '../../actions/sites';

type PanelMode = 'pending' | 'reassign';

function SmSiteCard({
  site,
  managers,
  mode,
  onUpdated,
  isDemo,
}: {
  site: OmSiteRecord;
  managers: SectorManagerOption[];
  mode: PanelMode;
  onUpdated: () => void;
  isDemo?: boolean;
}) {
  const [selected, setSelected] = useState(site.assigned_sm_epf ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleAssign = async () => {
    if (isDemo) {
      setError('Preview mode — assignments disabled until live sites exist in Supabase.');
      return;
    }
    setError(null);
    setDone(false);
    setBusy(true);
    const result = await assignSiteToSectorManager({ siteId: site.id, smEpf: selected });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setDone(true);
    onUpdated();
  };

  const handleClear = async () => {
    if (isDemo) {
      setError('Preview mode — assignments disabled until live sites exist in Supabase.');
      return;
    }
    setError(null);
    setBusy(true);
    const result = await clearSiteSectorManager(site.id);
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSelected('');
    onUpdated();
  };

  const smLabel = managers.find((m) => m.emp_number === site.assigned_sm_epf);

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black text-slate-900">{site.site_name}</h3>
          {site.address ? (
            <p className="mt-0.5 truncate text-xs text-slate-500">{site.address}</p>
          ) : null}
        </div>
        {mode === 'pending' ? (
          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-900">
            Pending SM
          </span>
        ) : smLabel ? (
          <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-indigo-800">
            {smLabel.emp_number}
          </span>
        ) : null}
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">
          Sector manager
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-xs font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          <option value="">— Select SM —</option>
          {managers.map((m) => (
            <option key={m.emp_number} value={m.emp_number}>
              {m.emp_number} — {m.full_name}
              {m.site_count > 0 ? ` (${m.site_count} sites)` : ''}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !selected}
          onClick={handleAssign}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : done ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <UserCheck className="h-3.5 w-3.5" />
          )}
          {mode === 'pending' ? 'Assign & activate' : 'Save change'}
        </button>
        {mode === 'reassign' && site.assigned_sm_epf ? (
          <button
            type="button"
            disabled={busy}
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
          >
            <UserMinus className="h-3.5 w-3.5" />
            Unassign
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function SiteSmAssignmentWorkbench({
  initialPending,
  initialAssigned,
  initialManagers,
  isDemo = false,
}: {
  initialPending: OmSiteRecord[];
  initialAssigned: OmSiteRecord[];
  initialManagers: SectorManagerOption[];
  isDemo?: boolean;
}) {
  const [mode, setMode] = useState<PanelMode>('pending');
  const [pending, setPending] = useState(initialPending);
  const [assigned, setAssigned] = useState(initialAssigned);
  const [managers, setManagers] = useState(initialManagers);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    const [p, a, m] = await Promise.all([
      getSitesPendingSmAssignment(),
      getSitesWithSmAssigned(),
      getSectorManagersForAssignment(),
    ]);
    setPending(p);
    setAssigned(a);
    setManagers(m);
    setRefreshing(false);
  }, []);

  const activeList = mode === 'pending' ? pending : assigned;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter(
      (s) =>
        s.site_name.toLowerCase().includes(q) ||
        (s.address?.toLowerCase().includes(q) ?? false) ||
        (s.assigned_sm_epf?.toLowerCase().includes(q) ?? false),
    );
  }, [activeList, search]);

  const managerLoad = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of assigned) {
      if (!s.assigned_sm_epf) continue;
      map.set(s.assigned_sm_epf, (map.get(s.assigned_sm_epf) ?? 0) + 1);
    }
    return managers
      .map((m) => ({ ...m, load: map.get(m.emp_number) ?? 0 }))
      .sort((a, b) => a.load - b.load);
  }, [assigned, managers]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setMode('pending')}
                className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                  mode === 'pending'
                    ? 'bg-white text-amber-800 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500'
                }`}
              >
                Pending ({pending.length})
              </button>
              <button
                type="button"
                onClick={() => setMode('reassign')}
                className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                  mode === 'reassign'
                    ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500'
                }`}
              >
                Reassign ({assigned.length})
              </button>
            </div>
            <button
              type="button"
              onClick={reload}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search site name, address, or SM EPF…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          <p className="text-sm text-slate-600">
            Sites created by MD without a Sector Manager appear under{' '}
            <strong className="text-slate-800">Pending</strong>. Assigning an SM updates{' '}
            <code className="text-xs">site_profiles.assigned_sm_epf</code> and unlocks the SM
            portal site list.
          </p>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
              <Building2 className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-600">
                {mode === 'pending'
                  ? 'No sites waiting for SM assignment.'
                  : 'No assigned sites match your search.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((site) => (
                <SmSiteCard
                  key={site.id}
                  site={site}
                  managers={managers}
                  mode={mode}
                  onUpdated={reload}
                  isDemo={isDemo}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 h-fit lg:sticky lg:top-6">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-600">
            SM workload
          </h2>
          <p className="mt-1 mb-4 text-xs text-slate-500">
            Active sector managers sorted by current site count (lowest first).
          </p>
          <ul className="space-y-2 max-h-[420px] overflow-y-auto">
            {managerLoad.map((m) => (
              <li
                key={m.emp_number}
                className="flex items-center justify-between gap-2 rounded-xl border border-white bg-white px-3 py-2 text-xs shadow-sm"
              >
                <span className="font-semibold text-slate-800 truncate">
                  {m.full_name}
                </span>
                <span className="shrink-0 font-mono text-[10px] font-bold text-indigo-700">
                  {m.load} sites
                </span>
              </li>
            ))}
            {managerLoad.length === 0 ? (
              <li className="text-xs text-slate-500">No active sector managers in HR.</li>
            ) : null}
          </ul>
        </aside>
      </div>
    </div>
  );
}
