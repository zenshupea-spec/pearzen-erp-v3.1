'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownAZ,
  ArrowUpDown,
  Download,
  Eye,
  Printer,
  Search,
  Users,
  X,
} from 'lucide-react';
import FmSubnav from '../components/FmSubnav';
import FmPayrollMonthSelector from '../components/FmPayrollMonthSelector';
import FmPayslipPreviewModal from '../components/FmPayslipPreviewModal';
import {
  buildFmPayrollRoster,
  filterPayrollRoster,
  rosterRowAccent,
  rosterTotals,
  ROSTER_SORT_OPTIONS,
  sortPayrollRoster,
  WORKFORCE_FILTER_OPTIONS,
  workforceGroupLabel,
  type FmPayrollRosterRow,
  type PayrollWorkforceFilter,
  type RosterSortKey,
} from '../lib/fm-payroll-roster-data';
import {
  downloadBulkPayslipPdf,
  downloadPayslipPdf,
  openBulkPayslipPrint,
  openPayslipPrint,
} from '../lib/fm-payslip-document';
import {
  FM_LIVE_PAYROLL_PERIOD,
  formatPayrollPeriodLabel,
  historicalPortfolioScale,
  type PayrollPeriod,
} from '../lib/payroll-period';
import { getFmPortfolio } from '../portfolio-actions';

function lkr(n: number) {
  return (
    'LKR ' +
    n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function lkrCompact(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString('en-LK')}`;
}

const GROUP_BADGE: Record<FmPayrollRosterRow['workforceGroup'], string> = {
  cvs: 'bg-indigo-100 text-indigo-800 ring-indigo-200/80',
  cvs_sm: 'bg-sky-100 text-sky-800 ring-sky-200/80',
  cafe: 'bg-violet-100 text-violet-800 ring-violet-200/80',
  guard: 'bg-slate-100 text-slate-700 ring-slate-200/80',
};

export default function FmPayrollRosterPage() {
  const [pinnedSites, setPinnedSites] = useState<Parameters<typeof buildFmPayrollRoster>[0]>([]);
  const [clientSites, setClientSites] = useState<Parameters<typeof buildFmPayrollRoster>[1]>([]);
  const [payrollPeriod, setPayrollPeriod] = useState<PayrollPeriod>(FM_LIVE_PAYROLL_PERIOD);

  useEffect(() => {
    void getFmPortfolio(payrollPeriod).then((payload) => {
      setPinnedSites(payload.pinnedSites);
      setClientSites(payload.sites);
    });
  }, [payrollPeriod]);

  const allRows = useMemo(
    () => buildFmPayrollRoster(pinnedSites, clientSites),
    [pinnedSites, clientSites],
  );
  const [query, setQuery] = useState('');
  const [workforce, setWorkforce] = useState<PayrollWorkforceFilter>('all');
  const [sortKey, setSortKey] = useState<RosterSortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [previewRow, setPreviewRow] = useState<FmPayrollRosterRow | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const periodLabel = formatPayrollPeriodLabel(payrollPeriod);
  const scale = historicalPortfolioScale(payrollPeriod);

  const filtered = useMemo(
    () => filterPayrollRoster(allRows, { query, workforce }),
    [allRows, query, workforce],
  );

  const sorted = useMemo(
    () => sortPayrollRoster(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir],
  );

  const scaledRows = useMemo(
    () =>
      sorted.map((row) => ({
        ...row,
        salaryLkr: Math.round(row.salaryLkr * scale),
        earningsLkr: Math.round(row.earningsLkr * scale),
        deductionsLkr: Math.round(row.deductionsLkr * scale),
        netPayLkr: Math.round(row.netPayLkr * scale),
      })),
    [sorted, scale],
  );

  const totals = useMemo(() => rosterTotals(scaledRows), [scaledRows]);

  const selectionLabel = useMemo(() => {
    const opt = WORKFORCE_FILTER_OPTIONS.find((o) => o.id === workforce);
    const group = opt?.label ?? 'All workforce';
    if (query.trim()) return `${group} (search: "${query.trim()}")`;
    return group;
  }, [workforce, query]);

  const toggleSort = (key: RosterSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'rank' || key === 'epf' || key === 'sector' || key === 'site' ? 'asc' : 'desc');
    }
  };

  const holidayCalendarIncomplete = true;

  return (
    <div className="min-h-screen bg-slate-50">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-25"
        style={{
          backgroundImage: 'radial-gradient(rgb(148 163 184 / 0.5) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <FmSubnav holidayCalendarIncomplete={holidayCalendarIncomplete} />

        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50">
              <Users className="h-4 w-4 text-blue-700" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
              Finance Manager Portal
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Payroll Employee Register
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600">
            Search and sort every employee on the payroll — CVS, sector managers, café staff, and
            field guards. View, print, or download payslips for {periodLabel} — per employee or in
            bulk for the current workforce filter and search.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600 shadow-sm">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              {allRows.length} employees in master register
            </div>
            <FmPayrollMonthSelector period={payrollPeriod} onChange={setPayrollPeriod} />
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-6 space-y-4 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl sm:p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, rank, EPF no, emp no, sector, site…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-10 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex flex-wrap gap-1.5">
                <span className="mr-1 self-center text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Workforce
                </span>
                {WORKFORCE_FILTER_OPTIONS.map((opt) => {
                  const active = workforce === opt.id;
                  const count =
                    opt.id === 'all'
                      ? allRows.length
                      : allRows.filter((r) => r.workforceGroup === opt.id).length;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setWorkforce(opt.id)}
                      className={`rounded-xl px-3 py-2 text-[11px] font-bold transition-all ${
                        active
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.short}
                      <span
                        className={`ml-1.5 tabular-nums ${active ? 'text-blue-200' : 'text-slate-400'}`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:ml-auto lg:ml-0">
                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Bulk
                </span>
                <button
                  type="button"
                  disabled={scaledRows.length === 0}
                  title={
                    scaledRows.length === 0
                      ? 'No employees in current selection'
                      : `Print ${scaledRows.length} payslip${scaledRows.length === 1 ? '' : 's'}`
                  }
                  onClick={() => openBulkPayslipPrint(scaledRows, periodLabel, selectionLabel)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print ({scaledRows.length})
                </button>
                <button
                  type="button"
                  disabled={scaledRows.length === 0 || bulkDownloading}
                  title={
                    scaledRows.length === 0
                      ? 'No employees in current selection'
                      : `Download PDF for ${scaledRows.length} payslip${scaledRows.length === 1 ? '' : 's'}`
                  }
                  onClick={() => {
                    setBulkDownloading(true);
                    void downloadBulkPayslipPdf(scaledRows, periodLabel, selectionLabel).finally(
                      () => setBulkDownloading(false),
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" />
                  {bulkDownloading ? 'Generating…' : `Download (${scaledRows.length})`}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                Sort
              </span>
              <div className="flex flex-wrap gap-1">
                {ROSTER_SORT_OPTIONS.map((opt) => {
                  const active = sortKey === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleSort(opt.id)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                      {active &&
                        (sortDir === 'asc' ? (
                          <ArrowDownAZ className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3" />
                        ))}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Summary strip */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Showing', value: String(totals.count), sub: 'employees' },
            { label: 'Earnings', value: lkrCompact(totals.gross), sub: 'gross' },
            { label: 'Deductions', value: lkrCompact(totals.deductions), sub: 'this period', danger: true },
            { label: 'Net pay', value: lkrCompact(totals.net), sub: 'take-home', success: true },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                {kpi.label}
              </p>
              <p
                className={`mt-0.5 font-mono text-lg font-black tabular-nums ${
                  kpi.success ? 'text-emerald-700' : kpi.danger ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {kpi.value}
              </p>
              <p className="text-[10px] font-medium text-slate-500">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Employee
                  </th>
                  <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    EPF
                  </th>
                  <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Sector · Site
                  </th>
                  <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Salary
                  </th>
                  <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Earnings
                  </th>
                  <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Deductions
                  </th>
                  <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Net
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Payslip
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scaledRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <p className="text-sm font-bold text-slate-600">No employees match your filters</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Try another workforce group or clear the search bar.
                      </p>
                    </td>
                  </tr>
                ) : (
                  scaledRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-l-4 transition-colors hover:bg-slate-50/80 ${rosterRowAccent(row.workforceGroup)}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{row.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] text-slate-500">{row.empNumber}</span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ring-1 ${GROUP_BADGE[row.workforceGroup]}`}
                          >
                            {workforceGroupLabel(row.workforceGroup)}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            {row.rank}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] font-semibold text-slate-700">
                        {row.epfNo}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-xs font-bold text-slate-800">{row.sector}</p>
                        <p className="mt-0.5 max-w-[14rem] truncate text-[11px] text-slate-500" title={row.site}>
                          {row.site}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-slate-700">
                        {lkr(row.salaryLkr)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-900">
                        {lkr(row.earningsLkr)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-bold text-red-600">
                        {row.deductionsLkr > 0 ? `− ${lkr(row.deductionsLkr)}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-black text-emerald-700">
                        {lkr(row.netPayLkr)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            title="View payslip"
                            onClick={() => setPreviewRow(row)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Print payslip"
                            onClick={() => openPayslipPrint(row, periodLabel)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Download PDF"
                            onClick={() => void downloadPayslipPdf(row, periodLabel)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition-colors hover:bg-blue-100"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {scaledRows.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-[10px] font-medium text-slate-500">
              {scaledRows.length} of {allRows.length} employees · {periodLabel}
              {scale !== 1 ? ' · historical period scale applied' : ''}
            </div>
          )}
        </div>
      </div>

      {previewRow && (
        <FmPayslipPreviewModal
          row={previewRow}
          periodLabel={periodLabel}
          onClose={() => setPreviewRow(null)}
        />
      )}
    </div>
  );
}
