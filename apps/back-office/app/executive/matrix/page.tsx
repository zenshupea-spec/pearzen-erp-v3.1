'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

import {
  ExecutivePageBody,
  ExecutivePageHeader,
  ExecutivePageLiveSubtitle,
  ExecutivePageLoading,
  ExecutivePageShell,
} from '../../../components/executive/ExecutivePageChrome';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { fetchRankMatrix, fetchPendingSalaryOverrides } from './actions';

export default function CompensationMatrixPage() {
  const [ranks, setRanks] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rankData, overrideData] = await Promise.all([
        fetchRankMatrix(),
        fetchPendingSalaryOverrides(),
      ]);
      setRanks(rankData);
      setOverrides(overrideData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ExecutivePageShell>
      <ExecutivePageHeader
        title="Compensation Matrix"
        subtitle={
          <ExecutivePageLiveSubtitle>
            Global rank defaults · Pending salary overrides
          </ExecutivePageLiveSubtitle>
        }
      />

      <ExecutivePageBody spacing="relaxed">
        {loading ? (
          <ExecutivePageLoading message="Loading compensation matrix…" />
        ) : (
        <>
        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-600">
            Global Rank Defaults
          </h2>
          <ExecutiveGlassCard className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/90 bg-slate-50/90 text-xs font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-6 py-4">Rank title</th>
                  <th className="px-6 py-4">Starting basic (LKR)</th>
                  <th className="px-6 py-4">Annual inc.</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {ranks.map((rank) => (
                  <tr key={rank.id} className="transition-colors hover:bg-white/60">
                    <td className="px-6 py-4 font-bold text-slate-900">{rank.title}</td>
                    <td className="px-6 py-4 font-mono font-semibold text-emerald-900 tabular-nums">
                      {rank.default_basic.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600 tabular-nums">
                      +{rank.annual_increment.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        className="text-xs font-bold uppercase text-indigo-700 hover:text-indigo-900"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ExecutiveGlassCard>
        </section>

        <section>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-800">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]" />
            Pending Salary Approvals
          </h2>
          {overrides.length === 0 ? (
            <ExecutiveGlassCard className="border-dashed p-10 text-center text-slate-600">
              No custom salary overrides requiring FM attention.
            </ExecutiveGlassCard>
          ) : (
            <div className="space-y-3">
              {overrides.map((emp) => (
                <ExecutiveGlassCard
                  key={emp.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-amber-200/80 p-5"
                >
                  <div>
                    <h3 className="font-bold text-slate-900">{emp.name}</h3>
                    <p className="text-xs text-slate-600">
                      {emp.reason}:{' '}
                      <span className="font-mono font-bold text-amber-900">
                        LKR {emp.overridePay.toLocaleString()}
                      </span>
                    </p>
                  </div>
                  <Link
                    href="/fm/exceptions"
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold uppercase text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
                  >
                    Review in FM portal
                  </Link>
                </ExecutiveGlassCard>
              ))}
            </div>
          )}
        </section>
        </>
        )}
      </ExecutivePageBody>
    </ExecutivePageShell>
  );
}
