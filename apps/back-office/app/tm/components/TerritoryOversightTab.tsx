'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Users } from 'lucide-react';
import StaffPortalLoading from '../../../components/portal/StaffPortalLoading';
import { COMMAND_CENTER_REFRESH_MS } from '../../om/lib/command-center-tabs';
import {
  getTmTerritoryOversight,
  type TmEscalationRow,
  type TmSectorManagerRollup,
} from '../actions/territory';

const SEVERITY_STYLES: Record<TmEscalationRow['severity'], string> = {
  HIGH: 'border-rose-200 bg-rose-50 text-rose-800',
  MEDIUM: 'border-amber-200 bg-amber-50 text-amber-800',
  LOW: 'border-sky-200 bg-sky-50 text-sky-800',
};

function complianceTone(pct: number): string {
  if (pct >= 90) return 'text-emerald-700';
  if (pct >= 75) return 'text-amber-700';
  return 'text-rose-700';
}

function deficitTone(count: number): string {
  if (count <= 0) return 'text-emerald-700';
  if (count <= 3) return 'text-amber-700';
  return 'text-rose-700';
}

function fmtRaisedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TerritoryOversightTab() {
  const [rollup, setRollup] = useState<TmSectorManagerRollup[]>([]);
  const [escalations, setEscalations] = useState<TmEscalationRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const payload = await getTmTerritoryOversight();
      setRollup(
        payload.rollup
          .slice()
          .sort((a, b) => b.activeDeficits - a.activeDeficits || b.disciplinary30Day - a.disciplinary30Day),
      );
      setEscalations(payload.escalations);
      if (payload.error) setError(payload.error);
    } catch {
      setError('Failed to load territory oversight.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const intervalId = window.setInterval(() => {
      void load(true);
    }, COMMAND_CENTER_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [load]);

  if (loading) {
    return (
      <StaffPortalLoading portal="tm" message="Loading territory oversight…" className="min-h-[16rem] py-16" />
    );
  }

  const totalDeficits = rollup.reduce((sum, row) => sum + row.activeDeficits, 0);
  const pendingEscalations = escalations.filter(
    (row) => !row.omAck || !row.smAck || !row.mdAck,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">
            SM territory rollup
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Live sector-manager KPIs from sites, visits, penalties, and open field incidents
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(false)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-sm hover:border-violet-200 hover:text-violet-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Sector managers', value: rollup.length },
          { label: 'Fleet deficits', value: totalDeficits },
          { label: 'Open escalations', value: pendingEscalations },
          {
            label: 'Avg visit compliance',
            value:
              rollup.length > 0
                ? `${Math.round(rollup.reduce((s, r) => s + r.visitCompliancePct, 0) / rollup.length)}%`
                : '—',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">
              {kpi.label}
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Users className="h-4 w-4 text-violet-600" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700">
            Sector manager performance
          </h3>
        </div>
        {rollup.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No sector managers assigned yet. Wire SM assignments in MNR and site directory.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">SM</th>
                  <th className="px-4 py-3">Sites</th>
                  <th className="px-4 py-3">7d shortage avg</th>
                  <th className="px-4 py-3">Active deficits</th>
                  <th className="px-4 py-3">Disciplinary 30d</th>
                  <th className="px-4 py-3">Visit compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rollup.map((row) => (
                  <tr key={row.emp_number} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{row.full_name}</p>
                      <p className="font-mono text-[10px] text-slate-500">{row.emp_number}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-700">
                      {row.site_count}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-700">
                      {row.shortage7DayAvg}
                    </td>
                    <td className={`px-4 py-3 font-black tabular-nums ${deficitTone(row.activeDeficits)}`}>
                      {row.activeDeficits}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-700">
                      {row.disciplinary30Day}
                    </td>
                    <td className={`px-4 py-3 font-black tabular-nums ${complianceTone(row.visitCompliancePct)}`}>
                      {row.visitCompliancePct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-rose-500" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700">
            Escalation queue
          </h3>
          {pendingEscalations > 0 ? (
            <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">
              {pendingEscalations} pending ack
            </span>
          ) : null}
        </div>
        {escalations.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No open field incidents requiring tri-role acknowledgement.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {escalations.map((row) => {
              const allAcked = row.omAck && row.smAck && row.mdAck;
              return (
                <li
                  key={row.id}
                  className={`px-4 py-4 ${allAcked ? 'bg-emerald-50/40' : 'bg-white'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">{row.id}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${SEVERITY_STYLES[row.severity]}`}
                        >
                          {row.severity}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{row.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {row.site} · {row.smName}
                        <span className="font-mono text-slate-400"> ({row.smEpf})</span>
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">{fmtRaisedAt(row.raisedAt)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {(['OM', 'SM', 'MD'] as const).map((role) => {
                        const acked =
                          role === 'OM' ? row.omAck : role === 'SM' ? row.smAck : row.mdAck;
                        return (
                          <span
                            key={role}
                            className={`rounded-lg border px-2 py-1 text-[9px] font-black ${
                              acked
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                          >
                            {role} {acked ? '✓' : '…'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
