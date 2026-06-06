'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchRankMatrix, fetchPendingSalaryOverrides } from './actions';

export default function CompensationMatrixPage() {
  const [ranks, setRanks] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [rankData, overrideData] = await Promise.all([
      fetchRankMatrix(),
      fetchPendingSalaryOverrides(),
    ]);
    setRanks(rankData);
    setOverrides(overrideData);
  };

  return (
    <div className="min-h-0 pb-20 font-sans">
      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/45 px-6 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150">
        <div className="flex w-full items-center gap-4">
          <Link
            href="/executive"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/70 text-slate-600 shadow-sm ring-1 ring-slate-900/5 transition-colors hover:text-slate-900"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
            Compensation Matrix
          </h1>
        </div>
      </header>

      <div className="w-full space-y-10 px-6 lg:px-12 2xl:px-24 py-8">
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-600">
              Global Rank Defaults
            </h2>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/75 bg-white/55 shadow-[0_12px_48px_-14px_rgba(15,23,42,0.12)] backdrop-blur-2xl backdrop-saturate-[1.35] ring-1 ring-slate-900/[0.045]">
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
          </div>
        </section>

        <section>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-800">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]" />
            Pending Salary Approvals
          </h2>
          {overrides.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300/90 bg-white/40 p-10 text-center text-slate-600 shadow-inner backdrop-blur-md">
              No custom salary overrides requiring MD attention.
            </div>
          ) : (
            <div className="space-y-3">
              {overrides.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center justify-between rounded-2xl border border-amber-200/80 bg-white/60 p-5 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl"
                >
                  <div>
                    <h3 className="font-bold text-slate-900">
                      {emp.first_name} {emp.last_name}
                    </h3>
                    <p className="text-xs text-slate-600">
                      Custom rate requested:{' '}
                      <span className="font-mono font-bold text-amber-900">
                        LKR {emp.custom_salary.toLocaleString()}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white/90 px-4 py-2 text-xs font-bold uppercase text-rose-700 shadow-sm hover:bg-rose-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold uppercase text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
