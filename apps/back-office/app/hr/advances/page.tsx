'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { processAdvanceApproval, fetchPendingAdvances } from './actions';

type AdvanceRow = Record<string, unknown> & {
  id: string;
  emp_number?: string;
  amount?: number;
  reason?: string;
  status?: string;
};

export default function SalaryAdvanceLedger() {
  const [currentUserRole, setCurrentUserRole] = useState<'HR' | 'MD'>('HR');
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    loadAdvances();
  }, []);

  const loadAdvances = async () => {
    setIsLoading(true);
    const result = await fetchPendingAdvances();
    if (result.success) {
      setAdvances((result.data as AdvanceRow[]) || []);
    }
    setIsLoading(false);
  };

  const handleAction = (id: string, status: 'APPROVED' | 'REJECTED') => {
    if (!window.confirm(`Are you sure you want to mark this advance as ${status}?`))
      return;

    startTransition(() => {
      void (async () => {
        const result = await processAdvanceApproval(id, status);
        if (result.success) {
          await loadAdvances(); // Refresh the list instantly
        } else {
          alert(`Failed to update database: ${result.error}`);
        }
      })();
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      {/* Header & Role Toggle (Dev Mode) */}
      <div className="bg-[#111118] border-b border-indigo-500/20 sticky top-0 z-50 px-6 py-5 shadow-lg flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase">
            Salary Advance Ledger
          </h1>
          <p className="text-[10px] text-indigo-400 font-mono font-bold uppercase tracking-widest mt-1">
            MD Approval Pipeline
          </p>
        </div>

        {/* Development Role Toggle */}
        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => setCurrentUserRole('HR')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider ${currentUserRole === 'HR' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
          >
            HR View
          </button>
          <button
            type="button"
            onClick={() => setCurrentUserRole('MD')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider ${currentUserRole === 'MD' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-white'}`}
          >
            MD God-Mode
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Ledger Table */}
        <div className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-slate-900/50 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              Pending & Actioned Requests
            </h2>
            {currentUserRole === 'HR' && (
              <button
                type="button"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all uppercase tracking-wider shadow-lg shadow-indigo-500/20"
              >
                + New Request
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#0a0a0e] text-slate-500 font-bold border-b border-slate-800 text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-4">EMP NO</th>
                  <th className="px-6 py-4">AMOUNT (LKR)</th>
                  <th className="px-6 py-4">REASON</th>
                  <th className="px-6 py-4">STATUS</th>
                  <th className="px-6 py-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-slate-500 font-mono animate-pulse"
                    >
                      Decrypting ledger records...
                    </td>
                  </tr>
                ) : advances.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-slate-500 font-medium"
                    >
                      No advance requests found in the database.
                    </td>
                  </tr>
                ) : (
                  advances.map((req) => (
                    <tr
                      key={req.id}
                      className="hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-6 py-4 font-mono font-bold text-white">
                        {req.emp_number || 'UNKNOWN'}
                      </td>
                      <td className="px-6 py-4 font-mono text-amber-400">
                        {Number(req.amount ?? 0).toLocaleString()} LKR
                      </td>
                      <td className="px-6 py-4 text-slate-400 truncate max-w-xs">
                        {req.reason || 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${
                            req.status === 'PENDING'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : req.status === 'APPROVED'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {req.status || 'PENDING'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {currentUserRole === 'MD' && req.status === 'PENDING' ? (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleAction(req.id, 'APPROVED')}
                              disabled={isPending}
                              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 rounded text-xs font-bold uppercase transition-all disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAction(req.id, 'REJECTED')}
                              disabled={isPending}
                              className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 rounded text-xs font-bold uppercase transition-all disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600 font-mono uppercase tracking-widest">
                            {req.status === 'PENDING'
                              ? 'AWAITING MD'
                              : 'ACTIONED'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
