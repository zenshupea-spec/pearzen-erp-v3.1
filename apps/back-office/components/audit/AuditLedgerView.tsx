'use client';

import Link from 'next/link';
import { useState, useMemo, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Radio,
  Coffee,
  Clock,
  MonitorDot,
  Globe,
  UserCircle2,
  Layers,
  Search,
  Filter,
  Calendar,
  ChevronUp,
  ChevronDown,
  X,
  ArrowLeft,
} from 'lucide-react';

import { fetchAuditLogs, type AuditRow } from '../../app/executive/audit/actions';
import type { PortalTab } from '../../lib/audit-portals';

interface TabDef {
  id: PortalTab;
  label: string;
  sub: string;
  Icon: React.ElementType;
  accent: string;
  iconBg: string;
  iconText: string;
  activeBg: string;
  activeBorder: string;
  activeText: string;
  badgeBg: string;
  badgeText: string;
}

const TAB_DEFS: TabDef[] = [
  {
    id: 'md-od',
    label: 'MD / OD Vault',
    sub: 'Executive overrides',
    Icon: ShieldCheck,
    accent: 'emerald',
    iconBg: 'bg-emerald-500/12',
    iconText: 'text-emerald-700',
    activeBg: 'bg-white/80',
    activeBorder: 'border-emerald-200/80',
    activeText: 'text-emerald-900',
    badgeBg: 'bg-emerald-100/80',
    badgeText: 'text-emerald-800',
  },
  {
    id: 'hq-staff',
    label: 'HQ Staff (FM / HR)',
    sub: 'Finance & HR actions',
    Icon: Users,
    accent: 'indigo',
    iconBg: 'bg-indigo-500/12',
    iconText: 'text-indigo-700',
    activeBg: 'bg-white/80',
    activeBorder: 'border-indigo-200/80',
    activeText: 'text-indigo-900',
    badgeBg: 'bg-indigo-100/80',
    badgeText: 'text-indigo-800',
  },
  {
    id: 'om',
    label: 'OM Command',
    sub: 'Field operations log',
    Icon: Radio,
    accent: 'sky',
    iconBg: 'bg-sky-500/12',
    iconText: 'text-sky-700',
    activeBg: 'bg-white/80',
    activeBorder: 'border-sky-200/80',
    activeText: 'text-sky-900',
    badgeBg: 'bg-sky-100/80',
    badgeText: 'text-sky-800',
  },
  {
    id: 'cafe',
    label: 'Café POS',
    sub: 'POS & menu changes',
    Icon: Coffee,
    accent: 'amber',
    iconBg: 'bg-amber-500/12',
    iconText: 'text-amber-700',
    activeBg: 'bg-white/80',
    activeBorder: 'border-amber-200/80',
    activeText: 'text-amber-900',
    badgeBg: 'bg-amber-100/80',
    badgeText: 'text-amber-800',
  },
];

function roleBadgeClass(role: string): string {
  if (role.includes('Director') || role.includes('Managing') || role === 'MD / OD')
    return 'bg-emerald-100/80 text-emerald-800 border-emerald-200/70';
  if (role.includes('Finance') || role.includes('HR'))
    return 'bg-indigo-100/80 text-indigo-800 border-indigo-200/70';
  if (role.includes('Operations'))
    return 'bg-sky-100/80 text-sky-800 border-sky-200/70';
  if (role.includes('Café') || role.includes('Barista'))
    return 'bg-amber-100/80 text-amber-800 border-amber-200/70';
  return 'bg-slate-100/80 text-slate-700 border-slate-200/70';
}

type SortField = 'timestamp' | 'userName';
type SortDir = 'asc' | 'desc';

type Props = {
  variant: 'executive' | 'staff';
  allowedTabs: PortalTab[];
  defaultTab: PortalTab;
};

export default function AuditLedgerView({ variant, allowedTabs, defaultTab }: Props) {
  const visibleTabs = TAB_DEFS.filter((tab) => allowedTabs.includes(tab.id));
  const [activeTab, setActiveTab] = useState<PortalTab>(defaultTab);
  const [searchUser, setSearchUser] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [liveRows, setLiveRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(defaultTab);
    }
  }, [activeTab, allowedTabs, defaultTab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const result = await fetchAuditLogs(activeTab);
      if (cancelled) return;
      setLiveRows(result.data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const currentTab = visibleTabs.find((t) => t.id === activeTab) ?? visibleTabs[0]!;

  const rows = useMemo(() => {
    let data = [...liveRows];

    if (searchUser.trim()) {
      const q = searchUser.toLowerCase();
      data = data.filter(
        (r) =>
          r.userName.toLowerCase().includes(q) ||
          r.userRole.toLowerCase().includes(q),
      );
    }

    if (filterDate) {
      data = data.filter((r) => r.timestamp.startsWith(filterDate));
    }

    data.sort((a, b) => {
      const aVal = sortField === 'timestamp' ? a.timestamp : a.userName;
      const bVal = sortField === 'timestamp' ? b.timestamp : b.userName;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return data;
  }, [liveRows, searchUser, filterDate, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-current" />
    ) : (
      <ChevronDown className="h-3 w-3 text-current" />
    );
  };

  const isStaff = variant === 'staff';

  return (
    <main
      className={`w-full flex-grow flex flex-col pb-12 pt-8 text-slate-900 antialiased ${
        isStaff ? 'px-6 md:px-10' : 'px-6 md:px-12 2xl:px-24'
      }`}
    >
      <div className="space-y-7">
        {isStaff ? (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-3 w-3" />
            Return to HQ Hub
          </Link>
        ) : null}

        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-slate-500">
              {isStaff ? 'HQ Portal' : 'Executive Vault'}
            </p>
            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 md:text-3xl">
              {isStaff ? 'Portal Activity Ledger' : 'Master Audit Ledger'}
            </h1>
            <p className="mt-1 text-sm font-bold uppercase tracking-widest text-slate-500">
              {isStaff
                ? 'Your portal actions only — every change is recorded and append-only.'
                : 'Immutable cross-portal activity log — all privileged actions captured in real time.'}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/45 px-4 py-2.5 shadow-sm backdrop-blur-xl">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
              Live Stream Active
            </span>
          </div>
        </div>

        {visibleTabs.length > 1 ? (
          <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/40 p-1.5 shadow-[0_8px_32px_-8px_rgba(15,23,42,0.10)] ring-1 ring-slate-900/[0.04] backdrop-blur-2xl backdrop-saturate-[1.3]">
            <div
              className={`grid gap-1.5 ${
                visibleTabs.length === 1
                  ? 'grid-cols-1'
                  : visibleTabs.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-2 sm:grid-cols-4'
              }`}
            >
              {visibleTabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`group flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all ${
                      active
                        ? `${tab.activeBg} ${tab.activeBorder} shadow-[0_4px_18px_-6px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.05]`
                        : 'border-transparent hover:bg-white/50'
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition-all ${
                        active
                          ? `${tab.iconBg} ${tab.activeBorder}`
                          : 'border-slate-200/60 bg-slate-100/60 group-hover:border-slate-300/60 group-hover:bg-white/60'
                      }`}
                    >
                      <tab.Icon
                        className={`h-4 w-4 transition-colors ${active ? tab.iconText : 'text-slate-400 group-hover:text-slate-600'}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-[13px] font-bold leading-tight transition-colors ${
                          active ? tab.activeText : 'text-slate-600 group-hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </p>
                      <p className="truncate text-[10px] text-slate-400">{tab.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-white/45 px-4 py-3 shadow-sm backdrop-blur-xl">
          <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <input
              type="text"
              placeholder="Search by employee or role…"
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
              className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
            />
            {searchUser ? (
              <button type="button" onClick={() => setSearchUser('')}>
                <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-800 outline-none"
            />
            {filterDate ? (
              <button type="button" onClick={() => setFilterDate('')}>
                <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleSort('timestamp')}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-all ${
                sortField === 'timestamp'
                  ? `${currentTab.activeBorder} ${currentTab.iconBg} ${currentTab.iconText}`
                  : 'border-slate-200/70 bg-white/60 text-slate-500 hover:border-slate-300/70 hover:bg-white/80'
              }`}
            >
              <Clock className="h-3 w-3" />
              Date/Time
              <SortIcon field="timestamp" />
            </button>
            <button
              type="button"
              onClick={() => toggleSort('userName')}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-all ${
                sortField === 'userName'
                  ? `${currentTab.activeBorder} ${currentTab.iconBg} ${currentTab.iconText}`
                  : 'border-slate-200/70 bg-white/60 text-slate-500 hover:border-slate-300/70 hover:bg-white/80'
              }`}
            >
              <UserCircle2 className="h-3 w-3" />
              Employee
              <SortIcon field="userName" />
            </button>
          </div>

          {(searchUser || filterDate) && (
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-[11px] font-bold text-amber-800">
              <Filter className="h-3 w-3" />
              {rows.length} result{rows.length !== 1 ? 's' : ''} found
              <button
                type="button"
                onClick={() => {
                  setSearchUser('');
                  setFilterDate('');
                }}
                className="ml-1 text-amber-600 hover:text-amber-900"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { Icon: Layers, label: 'Total Entries', value: String(rows.length) },
            {
              Icon: UserCircle2,
              label: 'Unique Actors',
              value: String(new Set(rows.map((r) => r.userName)).size),
            },
            {
              Icon: MonitorDot,
              label: 'Unique IPs',
              value: String(new Set(rows.map((r) => r.ipAddress)).size),
            },
          ].map(({ Icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/45 px-4 py-3.5 shadow-sm ring-1 ring-slate-900/[0.04] backdrop-blur-xl"
            >
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${currentTab.iconBg} ${currentTab.activeBorder}`}
              >
                <Icon className={`h-4 w-4 ${currentTab.iconText}`} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {label}
                </p>
                <p className="text-3xl font-black text-slate-900">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/75 bg-white/50 shadow-[0_16px_56px_-16px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.045] backdrop-blur-2xl backdrop-saturate-[1.35]">
          <div className="flex items-center justify-between border-b border-white/60 bg-white/30 px-6 py-3.5">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-lg border ${currentTab.iconBg} ${currentTab.activeBorder}`}
              >
                <currentTab.Icon className={`h-3.5 w-3.5 ${currentTab.iconText}`} />
              </div>
              <p className="text-lg font-bold uppercase text-slate-800">
                {currentTab.label} — Activity Log
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
              <Clock className="h-3 w-3" />
              {sortField === 'timestamp'
                ? `Sorted by date ${sortDir === 'desc' ? '(newest first)' : '(oldest first)'}`
                : `Sorted by employee (${sortDir === 'asc' ? 'A–Z' : 'Z–A'})`}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left">
              <thead>
                <tr className="border-b border-slate-200/70 bg-slate-50/60">
                  <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <button
                      type="button"
                      onClick={() => toggleSort('timestamp')}
                      className="flex items-center gap-1.5 transition-colors hover:text-slate-800"
                    >
                      <Clock className="h-3 w-3" />
                      Timestamp
                      <SortIcon field="timestamp" />
                    </button>
                  </th>
                  <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <button
                      type="button"
                      onClick={() => toggleSort('userName')}
                      className="flex items-center gap-1.5 transition-colors hover:text-slate-800"
                    >
                      <UserCircle2 className="h-3 w-3" />
                      User
                      <SortIcon field="userName" />
                    </button>
                  </th>
                  <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Action Performed
                  </th>
                  <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Target Entity
                  </th>
                  <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Globe className="h-3 w-3" />
                      IP Address
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-sm font-semibold text-slate-500"
                    >
                      Loading audit trail…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-sm font-semibold text-slate-500"
                    >
                      No audit entries recorded yet. Actions in your portal will append here.
                    </td>
                  </tr>
                ) : null}
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`group transition-colors hover:bg-white/60 ${
                      i % 2 === 0 ? 'bg-transparent' : 'bg-slate-50/30'
                    }`}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">
                      <span className="font-mono text-[11px] font-semibold tracking-wide text-slate-600">
                        {row.timestamp}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">
                      <p className="font-bold text-slate-900">{row.userName}</p>
                      <span
                        className={`mt-0.5 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleBadgeClass(row.userRole)}`}
                      >
                        {row.userRole}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">
                      <span
                        className={`inline-flex items-center rounded-xl border px-3 py-1 text-[11px] font-bold tracking-wide ${currentTab.badgeBg} ${currentTab.badgeText} border-${currentTab.accent}-200/60`}
                      >
                        {row.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">
                      <span className="font-mono text-xs font-semibold text-slate-700">
                        {row.targetEntity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">
                      <span className="rounded-lg border border-slate-200/70 bg-slate-100/70 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-600">
                        {row.ipAddress}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-white/60 bg-white/25 px-6 py-3 text-[10px] font-semibold text-slate-400">
            {rows.length} entries displayed — read-only immutable ledger — data is append-only
          </div>
        </div>
      </div>
    </main>
  );
}
