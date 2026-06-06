'use client';

import React, { useState } from 'react';
import { 
  UserMinus, 
  Search, 
  AlertTriangle, 
  ShieldAlert,
  Wallet,
  CheckCircle2,
  Lock,
  ArrowRight
} from 'lucide-react';

// Mock Data representing the upgraded database schema
const RESIGNATION_QUEUE = [
  {
    id: 'EMP-0842',
    name: 'FERNANDO W.A.',
    rank: 'CSO',
    site: 'Lanka Hospitals',
    joined: '2025-01-15',
    balances: {
      uniform: 4500,
      meal: 1200,
      advance: 0
    },
    retention: {
      prevMonthShifts: 28, // Fails 30 threshold
      currMonthShifts: 5,
      status: 'STOP_PAYMENT',
      reason: 'Prev. month shifts below threshold (30)'
    }
  },
  {
    id: 'EMP-0911',
    name: 'SILVA P.K.',
    rank: 'OIC',
    site: 'BOC Main Branch',
    joined: '2024-11-01',
    balances: {
      uniform: 0,
      meal: 0,
      advance: 5000
    },
    retention: {
      prevMonthShifts: 31,
      currMonthShifts: 4, // Fails 10 threshold
      status: 'HALF_SALARY',
      reason: 'Curr. month shifts below threshold (10)'
    }
  }
];

export default function ClearanceDesk() {
  const [search, setSearch] = useState('');

  const formatLKR = (amount: number) => 
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(amount);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/60 bg-white/45 px-8 py-4 backdrop-blur-xl shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm">
            <UserMinus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Offboarding & Clearance</h1>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Resignations & Debt Recovery</p>
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search EMP No or NIC..." 
            className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-8 space-y-6">
        
        {/* Alerts Banner */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-4">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-amber-900 uppercase">Retention Matrix Active</h3>
            <p className="text-sm font-semibold text-amber-700 mt-1">
              Final salary releases are governed by the MD's retention shift thresholds (Prev: 30, Curr: 10). 
              Guards failing thresholds will automatically have salaries locked pending FM manual override.
            </p>
          </div>
        </div>

        {/* Clearance Queue */}
        <div className="grid grid-cols-1 gap-6">
          {RESIGNATION_QUEUE.map((emp) => {
            const totalDebt = emp.balances.uniform + emp.balances.meal + emp.balances.advance;
            const isHardStop = emp.retention.status === 'STOP_PAYMENT';
            
            return (
              <div key={emp.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col md:flex-row">
                
                {/* Left: Guard Info & Form */}
                <div className="flex-1 p-6 border-b md:border-b-0 md:border-r border-slate-100">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{emp.id}</span>
                        <span className="text-xs font-bold text-slate-400 uppercase">Joined: {emp.joined}</span>
                      </div>
                      <h2 className="text-lg font-black uppercase text-slate-900">{emp.name}</h2>
                      <p className="text-sm font-bold text-slate-500 uppercase">{emp.rank} • {emp.site}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Resignation Type</label>
                      <select className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold focus:outline-none focus:border-rose-500">
                        <option>AWOL (Desertion)</option>
                        <option>Resigned with Notice</option>
                        <option>Terminated</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Effective Date</label>
                      <input type="date" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold focus:outline-none focus:border-rose-500" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Offboarding Notes</label>
                    <textarea rows={2} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold focus:outline-none focus:border-rose-500" placeholder="e.g. Handed over uniform..." />
                  </div>
                </div>

                {/* Right: Financials & Retention Lock */}
                <div className="w-full md:w-80 bg-slate-50 p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5" /> Pending Debt Recovery
                    </h3>
                    <div className="space-y-2 mb-6">
                      <div className="flex justify-between text-sm font-semibold text-slate-600">
                        <span>Uniform Deduction</span>
                        <span className="font-mono tabular-nums">{formatLKR(emp.balances.uniform)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold text-slate-600">
                        <span>Meals/Accom</span>
                        <span className="font-mono tabular-nums">{formatLKR(emp.balances.meal)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-black text-rose-600">
                        <span>Total Due to Co.</span>
                        <span className="font-mono tabular-nums">{formatLKR(totalDebt)}</span>
                      </div>
                    </div>

                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Retention Status</h3>
                    <div className={`p-3 rounded-xl border ${isHardStop ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {isHardStop ? <Lock className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                        <span className="text-xs font-black uppercase tracking-wider">
                          {isHardStop ? 'HARD STOP (NO PAY)' : 'HALF SALARY HOLD'}
                        </span>
                      </div>
                      <p className="text-[11px] font-bold leading-tight opacity-80">{emp.retention.reason}</p>
                    </div>
                  </div>

                  <button className="w-full mt-6 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all">
                    Process Clearance <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      </main>
    </div>
  );
}
