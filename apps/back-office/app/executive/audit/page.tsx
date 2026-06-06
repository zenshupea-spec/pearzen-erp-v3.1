'use client';

import { useState, useMemo } from 'react';
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
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type PortalTab = 'md-od' | 'hq-staff' | 'om' | 'cafe';

interface AuditRow {
  id: string;
  timestamp: string;
  userName: string;
  userRole: string;
  action: string;
  targetEntity: string;
  ipAddress: string;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK: Record<PortalTab, AuditRow[]> = {
  'md-od': [
    {
      id: '1',
      timestamp: '2026-05-23 09:14:32',
      userName: 'Arjun Peiris',
      userRole: 'Managing Director',
      action: 'Reverted Invoice to Unpaid',
      targetEntity: 'Lanka Hospitals — INV-2026-0441',
      ipAddress: '192.168.1.10',
    },
    {
      id: '2',
      timestamp: '2026-05-22 17:42:11',
      userName: 'Dilnoza Fernando',
      userRole: 'Operations Developer',
      action: 'Override Payroll Lock',
      targetEntity: 'May 2026 Payroll Cycle',
      ipAddress: '10.0.0.5',
    },
    {
      id: '3',
      timestamp: '2026-05-22 14:05:50',
      userName: 'Arjun Peiris',
      userRole: 'Managing Director',
      action: 'Approved Bulk Discount',
      targetEntity: 'Lanka Hospitals — 15% Rate Card',
      ipAddress: '192.168.1.10',
    },
    {
      id: '4',
      timestamp: '2026-05-21 11:30:04',
      userName: 'Dilnoza Fernando',
      userRole: 'Operations Developer',
      action: 'Deleted Bill Entry',
      targetEntity: 'OPEX-2026-0089',
      ipAddress: '10.0.0.5',
    },
    {
      id: '5',
      timestamp: '2026-05-20 16:18:27',
      userName: 'Arjun Peiris',
      userRole: 'Managing Director',
      action: 'Changed Commission Rate',
      targetEntity: 'Site: Colombo 7 — 8% to 10%',
      ipAddress: '192.168.1.10',
    },
  ],
  'hq-staff': [
    {
      id: '1',
      timestamp: '2026-05-23 08:55:17',
      userName: 'Nimali Jayawardena',
      userRole: 'Finance Manager',
      action: 'Generated Payroll Sheet',
      targetEntity: 'May 2026 — All Staff',
      ipAddress: '10.0.1.22',
    },
    {
      id: '2',
      timestamp: '2026-05-22 15:33:44',
      userName: 'Kasun Perera',
      userRole: 'HR Manager',
      action: 'Added Salary Advance',
      targetEntity: 'Ruwan Silva — LKR 25,000',
      ipAddress: '10.0.1.15',
    },
    {
      id: '3',
      timestamp: '2026-05-22 11:20:09',
      userName: 'Nimali Jayawardena',
      userRole: 'Finance Manager',
      action: 'Exported Payroll CSV',
      targetEntity: 'May 2026 Export Bundle',
      ipAddress: '10.0.1.22',
    },
    {
      id: '4',
      timestamp: '2026-05-21 14:47:31',
      userName: 'Kasun Perera',
      userRole: 'HR Manager',
      action: 'Removed Roster Entry',
      targetEntity: 'Site: Wellawatta — 21 May',
      ipAddress: '10.0.1.15',
    },
    {
      id: '5',
      timestamp: '2026-05-20 09:12:55',
      userName: 'Nimali Jayawardena',
      userRole: 'Finance Manager',
      action: 'Modified Deduction Rule',
      targetEntity: 'EPF Rate — 8% to 10%',
      ipAddress: '10.0.1.22',
    },
  ],
  om: [
    {
      id: '1',
      timestamp: '2026-05-23 10:22:43',
      userName: 'Tharindu Silva',
      userRole: 'Operations Manager',
      action: 'Verified Check-In Record',
      targetEntity: 'Ruwan Dissanayake — Colombo 4',
      ipAddress: '10.0.2.33',
    },
    {
      id: '2',
      timestamp: '2026-05-22 16:08:29',
      userName: 'Priya Bandara',
      userRole: 'Operations Manager',
      action: 'Flagged Roster Discrepancy',
      targetEntity: 'Site: Dehiwala — 22 May Roster',
      ipAddress: '10.0.2.41',
    },
    {
      id: '3',
      timestamp: '2026-05-22 13:44:18',
      userName: 'Tharindu Silva',
      userRole: 'Operations Manager',
      action: 'Resolved Field Incident',
      targetEntity: 'INC-2026-112 — Colombo 4',
      ipAddress: '10.0.2.33',
    },
    {
      id: '4',
      timestamp: '2026-05-21 10:55:02',
      userName: 'Priya Bandara',
      userRole: 'Operations Manager',
      action: 'Edited Shift Schedule',
      targetEntity: 'Wellawatta — Week 21',
      ipAddress: '10.0.2.41',
    },
    {
      id: '5',
      timestamp: '2026-05-20 14:30:17',
      userName: 'Tharindu Silva',
      userRole: 'Operations Manager',
      action: 'Closed Verification Queue',
      targetEntity: '14 Entries — 20 May Batch',
      ipAddress: '10.0.2.33',
    },
  ],
  cafe: [
    {
      id: '1',
      timestamp: '2026-05-23 11:05:38',
      userName: 'Samantha Rajapaksa',
      userRole: 'Café Supervisor',
      action: 'Changed Menu Price',
      targetEntity: 'Cappuccino — LKR 450 to LKR 490',
      ipAddress: '192.168.3.10',
    },
    {
      id: '2',
      timestamp: '2026-05-22 18:22:11',
      userName: 'Dinesh Kumara',
      userRole: 'Barista',
      action: 'Voided POS Transaction',
      targetEntity: 'POS-TXN-20260522-0047',
      ipAddress: '192.168.3.11',
    },
    {
      id: '3',
      timestamp: '2026-05-22 14:55:44',
      userName: 'Samantha Rajapaksa',
      userRole: 'Café Supervisor',
      action: 'Submitted Float Entry',
      targetEntity: 'Morning Float — LKR 5,000',
      ipAddress: '192.168.3.10',
    },
    {
      id: '4',
      timestamp: '2026-05-21 12:40:29',
      userName: 'Samantha Rajapaksa',
      userRole: 'Café Supervisor',
      action: 'Removed Menu Item',
      targetEntity: 'Seasonal Mango Smoothie',
      ipAddress: '192.168.3.10',
    },
    {
      id: '5',
      timestamp: '2026-05-20 09:30:15',
      userName: 'Dinesh Kumara',
      userRole: 'Barista',
      action: 'Applied Blind Float Variance',
      targetEntity: 'Shift End — LKR 120 Overage',
      ipAddress: '192.168.3.11',
    },
  ],
};

// ─── Tab config ────────────────────────────────────────────────────────────────

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

const TABS: TabDef[] = [
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

// ─── Role badge colours ─────────────────────────────────────────────────────────

function roleBadgeClass(role: string): string {
  if (role.includes('Director') || role.includes('Managing'))
    return 'bg-emerald-100/80 text-emerald-800 border-emerald-200/70';
  if (role.includes('Finance') || role.includes('HR'))
    return 'bg-indigo-100/80 text-indigo-800 border-indigo-200/70';
  if (role.includes('Operations'))
    return 'bg-sky-100/80 text-sky-800 border-sky-200/70';
  if (role.includes('Café') || role.includes('Barista'))
    return 'bg-amber-100/80 text-amber-800 border-amber-200/70';
  return 'bg-slate-100/80 text-slate-700 border-slate-200/70';
}

// ─── Page component ─────────────────────────────────────────────────────────────

type SortField = 'timestamp' | 'userName';
type SortDir   = 'asc' | 'desc';

export default function MasterAuditLedgerPage() {
  const [activeTab,   setActiveTab]   = useState<PortalTab>('md-od');
  const [searchUser,  setSearchUser]  = useState('');
  const [filterDate,  setFilterDate]  = useState('');
  const [sortField,   setSortField]   = useState<SortField>('timestamp');
  const [sortDir,     setSortDir]     = useState<SortDir>('desc');

  const currentTab = TABS.find((t) => t.id === activeTab)!;

  const rows = useMemo(() => {
    let data = [...MOCK[activeTab]];

    if (searchUser.trim()) {
      const q = searchUser.toLowerCase();
      data = data.filter(
        (r) =>
          r.userName.toLowerCase().includes(q) ||
          r.userRole.toLowerCase().includes(q)
      );
    }

    if (filterDate) {
      data = data.filter((r) => r.timestamp.startsWith(filterDate));
    }

    data.sort((a, b) => {
      const aVal = sortField === 'timestamp' ? a.timestamp : a.userName;
      const bVal = sortField === 'timestamp' ? b.timestamp : b.userName;
      const cmp  = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return data;
  }, [activeTab, searchUser, filterDate, sortField, sortDir]);

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
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-current" />
      : <ChevronDown className="h-3 w-3 text-current" />;
  };

  return (
    <main className="w-full flex-grow flex flex-col px-6 md:px-12 2xl:px-24 pb-12 pt-8 text-slate-900 antialiased">
      <div className="space-y-7">

        {/* ── Page header ── */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
              Executive Vault
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tight">
              Master Audit Ledger
            </h1>
            <p className="mt-1 text-sm font-bold text-slate-500 uppercase tracking-widest">
              Immutable cross-portal activity log — all privileged actions captured in real time.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/45 px-4 py-2.5 shadow-sm backdrop-blur-xl">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
              Live Stream Active
            </span>
          </div>
        </div>

        {/* ── Portal tabs ── */}
        <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/40 p-1.5 shadow-[0_8px_32px_-8px_rgba(15,23,42,0.10)] backdrop-blur-2xl backdrop-saturate-[1.3] ring-1 ring-slate-900/[0.04]">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {TABS.map((tab) => {
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
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition-all ${
                    active
                      ? `${tab.iconBg} ${tab.activeBorder}`
                      : 'border-slate-200/60 bg-slate-100/60 group-hover:border-slate-300/60 group-hover:bg-white/60'
                  }`}>
                    <tab.Icon className={`h-4 w-4 transition-colors ${active ? tab.iconText : 'text-slate-400 group-hover:text-slate-600'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[13px] font-bold leading-tight transition-colors ${
                      active ? tab.activeText : 'text-slate-600 group-hover:text-slate-900'
                    }`}>
                      {tab.label}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">{tab.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-white/45 px-4 py-3 shadow-sm backdrop-blur-xl">
          {/* Employee search */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 min-w-[200px] flex-1">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <input
              type="text"
              placeholder="Search by employee or role…"
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
              className="w-full bg-transparent text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none"
            />
            {searchUser && (
              <button type="button" onClick={() => setSearchUser('')}>
                <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>

          {/* Date filter */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-800 outline-none"
            />
            {filterDate && (
              <button type="button" onClick={() => setFilterDate('')}>
                <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>

          {/* Sort buttons */}
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

          {/* Active filter summary */}
          {(searchUser || filterDate) && (
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-[11px] font-bold text-amber-800">
              <Filter className="h-3 w-3" />
              {rows.length} result{rows.length !== 1 ? 's' : ''} found
              <button
                type="button"
                onClick={() => { setSearchUser(''); setFilterDate(''); }}
                className="ml-1 text-amber-600 hover:text-amber-900"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { Icon: Layers, label: 'Total Entries', value: String(rows.length) },
            { Icon: UserCircle2, label: 'Unique Actors', value: String(new Set(rows.map((r) => r.userName)).size) },
            { Icon: MonitorDot, label: 'Unique IPs', value: String(new Set(rows.map((r) => r.ipAddress)).size) },
          ].map(({ Icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/45 px-4 py-3.5 shadow-sm backdrop-blur-xl ring-1 ring-slate-900/[0.04]"
            >
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${currentTab.iconBg} ${currentTab.activeBorder}`}>
                <Icon className={`h-4 w-4 ${currentTab.iconText}`} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
                <p className="text-3xl font-black text-slate-900">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Audit table ── */}
        <div className="overflow-hidden rounded-2xl border border-white/75 bg-white/50 shadow-[0_16px_56px_-16px_rgba(15,23,42,0.12)] backdrop-blur-2xl backdrop-saturate-[1.35] ring-1 ring-slate-900/[0.045]">

          {/* Table header bar */}
          <div className="flex items-center justify-between border-b border-white/60 bg-white/30 px-6 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${currentTab.iconBg} ${currentTab.activeBorder}`}>
                <currentTab.Icon className={`h-3.5 w-3.5 ${currentTab.iconText}`} />
              </div>
              <p className="text-lg font-bold text-slate-800 uppercase">
                {currentTab.label} — Activity Log
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
              <Clock className="h-3 w-3" />
              {sortField === 'timestamp'
                ? `Sorted by date ${sortDir === 'desc' ? '(newest first)' : '(oldest first)'}`
                : `Sorted by employee (${sortDir === 'asc' ? 'A–Z' : 'Z–A'})`
              }
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left">
              <thead>
                <tr className="border-b border-slate-200/70 bg-slate-50/60">
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('timestamp')}
                      className="flex items-center gap-1.5 hover:text-slate-800 transition-colors"
                    >
                      <Clock className="h-3 w-3" />
                      Timestamp
                      <SortIcon field="timestamp" />
                    </button>
                  </th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('userName')}
                      className="flex items-center gap-1.5 hover:text-slate-800 transition-colors"
                    >
                      <UserCircle2 className="h-3 w-3" />
                      User
                      <SortIcon field="userName" />
                    </button>
                  </th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Action Performed
                  </th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Target Entity
                  </th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><Globe className="h-3 w-3" />IP Address</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`group transition-colors hover:bg-white/60 ${
                      i % 2 === 0 ? 'bg-transparent' : 'bg-slate-50/30'
                    }`}
                  >
                    {/* Timestamp */}
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">
                      <span className="font-mono text-[11px] font-semibold tracking-wide text-slate-600">
                        {row.timestamp}
                      </span>
                    </td>

                    {/* User */}
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">
                      <p className="font-bold text-slate-900">{row.userName}</p>
                      <span className={`mt-0.5 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleBadgeClass(row.userRole)}`}>
                        {row.userRole}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">
                      <span className={`inline-flex items-center rounded-xl border px-3 py-1 text-[11px] font-bold tracking-wide ${currentTab.badgeBg} ${currentTab.badgeText} border-${currentTab.accent}-200/60`}>
                        {row.action}
                      </span>
                    </td>

                    {/* Target Entity */}
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">
                      <span className="font-mono text-xs font-semibold text-slate-700">
                        {row.targetEntity}
                      </span>
                    </td>

                    {/* IP Address */}
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

          {/* Table footer */}
          <div className="border-t border-white/60 bg-white/25 px-6 py-3 text-[10px] font-semibold text-slate-400">
            {rows.length} entries displayed — read-only immutable ledger — data is append-only
          </div>
        </div>
      </div>
    </main>
  );
}
