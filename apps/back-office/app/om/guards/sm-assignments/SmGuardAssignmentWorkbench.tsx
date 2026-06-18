'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react';
import {
  assignGuardToSectorManager,
  clearGuardSectorManagerLink,
  getOmSmGuardAssignmentData,
  linkGuardSmFromSite,
  type OmSmGuardLinkRow,
  type SmGuardLinkStatus,
} from '../../actions/sm-guard-assignments';
import type { SectorManagerOption } from '../../actions/sites';

type PanelMode = 'unlinked' | 'mismatch' | 'all';

const STATUS_META: Record<
  SmGuardLinkStatus,
  { label: string; badge: string }
> = {
  linked: {
    label: 'Linked',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  unlinked: {
    label: 'Unlinked',
    badge: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  mismatch: {
    label: 'Mismatch',
    badge: 'border-rose-200 bg-rose-50 text-rose-800',
  },
};

function GuardSmCard({
  row,
  managers,
  onUpdated,
}: {
  row: OmSmGuardLinkRow;
  managers: SectorManagerOption[];
  onUpdated: () => void;
}) {
  const suggestedSm = row.siteSmEpf ?? '';
  const [selected, setSelected] = useState(row.linkedSmEpf ?? suggestedSm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setSelected(row.linkedSmEpf ?? row.siteSmEpf ?? '');
    setDone(false);
    setError(null);
  }, [row.guardId, row.linkedSmEpf, row.siteSmEpf]);

  const handleSave = async () => {
    setError(null);
    setDone(false);
    setBusy(true);
    const result = await assignGuardToSectorManager({
      guardEpf: row.guardEpf,
      guardId: row.guardId,
      smEpf: selected,
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setDone(true);
    onUpdated();
  };

  const handleClear = async () => {
    setError(null);
    setBusy(true);
    const result = await clearGuardSectorManagerLink({
      guardEpf: row.guardEpf,
      guardId: row.guardId,
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSelected(suggestedSm);
    onUpdated();
  };

  const handleLinkFromSite = async () => {
    setError(null);
    setBusy(true);
    const result = await linkGuardSmFromSite({
      guardEpf: row.guardEpf,
      guardId: row.guardId,
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSelected(result.smEpf);
    setDone(true);
    onUpdated();
  };

  const statusMeta = STATUS_META[row.status];

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black text-slate-900">
            {row.rank} · {row.guardName}
          </h3>
          <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-500">
            EPF {row.guardEpf || '—'}
          </p>
          {row.siteName ? (
            <p className="mt-1 truncate text-xs text-slate-600">Site · {row.siteName}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">No site in MNR</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${statusMeta.badge}`}
        >
          {statusMeta.label}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
          <dt className="font-bold uppercase tracking-wider text-slate-500">Site SM</dt>
          <dd className="mt-0.5 font-semibold text-slate-800">
            {row.siteSmEpf
              ? `${row.siteSmName ?? row.siteSmEpf} · ${row.siteSmEpf}`
              : '—'}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
          <dt className="font-bold uppercase tracking-wider text-slate-500">Linked SM</dt>
          <dd className="mt-0.5 font-semibold text-slate-800">
            {row.linkedSmEpf
              ? `${row.linkedSmName ?? row.linkedSmEpf} · ${row.linkedSmEpf}`
              : '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">
          Assign sector manager
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
          onClick={handleSave}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : done ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <UserCheck className="h-3.5 w-3.5" />
          )}
          Save link
        </button>
        {row.siteSmEpf && row.status !== 'linked' ? (
          <button
            type="button"
            disabled={busy}
            onClick={handleLinkFromSite}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          >
            Use site SM
          </button>
        ) : null}
        {row.linkedSmEpf ? (
          <button
            type="button"
            disabled={busy}
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
          >
            <UserMinus className="h-3.5 w-3.5" />
            Clear
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function SmGuardAssignmentWorkbench({
  initialRows,
  initialManagers,
  initialCounts,
}: {
  initialRows: OmSmGuardLinkRow[];
  initialManagers: SectorManagerOption[];
  initialCounts: { linked: number; unlinked: number; mismatch: number };
}) {
  const [rows, setRows] = useState(initialRows);
  const [managers, setManagers] = useState(initialManagers);
  const [counts, setCounts] = useState(initialCounts);
  const [mode, setMode] = useState<PanelMode>('unlinked');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    const data = await getOmSmGuardAssignmentData();
    setRows(data.rows);
    setManagers(data.managers);
    setCounts(data.counts);
    setRefreshing(false);
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (mode === 'unlinked') {
      list = rows.filter((row) => row.status === 'unlinked');
    } else if (mode === 'mismatch') {
      list = rows.filter((row) => row.status === 'mismatch');
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (row) =>
        row.guardName.toLowerCase().includes(q) ||
        row.guardEpf.toLowerCase().includes(q) ||
        (row.siteName?.toLowerCase().includes(q) ?? false) ||
        (row.linkedSmEpf?.toLowerCase().includes(q) ?? false) ||
        (row.siteSmEpf?.toLowerCase().includes(q) ?? false),
    );
  }, [rows, mode, search]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Linked', value: counts.linked, tone: 'text-emerald-700' },
          { label: 'Unlinked', value: counts.unlinked, tone: 'text-amber-800' },
          { label: 'Mismatch', value: counts.mismatch, tone: 'text-rose-700' },
        ].map(({ label, value, tone }) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {label}
            </p>
            <p className={`mt-1 text-2xl font-black ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 shadow-inner">
          {(
            [
              ['unlinked', `Unlinked (${counts.unlinked})`],
              ['mismatch', `Mismatch (${counts.mismatch})`],
              ['all', `All guards (${rows.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                mode === key
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void reload()}
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
          placeholder="Search guard, EPF, site, or SM…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      <p className="text-sm text-slate-600">
        Explicit links in <code className="text-xs">sm_guard_assignments</code> drive the SM portal
        guard roster. Guards on an SM-owned site without a link still appear via site fallback — use{' '}
        <strong className="text-slate-800">Use site SM</strong> to persist the link after MNR site
        assignment.
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
          {mode === 'mismatch' ? (
            <AlertTriangle className="mx-auto h-8 w-8 text-slate-300" />
          ) : (
            <Users className="mx-auto h-8 w-8 text-slate-300" />
          )}
          <p className="mt-3 text-sm font-semibold text-slate-600">
            {mode === 'unlinked'
              ? 'All guards with sites are linked to their Sector Manager.'
              : mode === 'mismatch'
                ? 'No guard/SM mismatches found.'
                : 'No guards match your search.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => (
            <GuardSmCard
              key={row.guardId}
              row={row}
              managers={managers}
              onUpdated={() => void reload()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
