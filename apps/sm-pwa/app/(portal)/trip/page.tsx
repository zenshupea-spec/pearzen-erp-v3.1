'use client'

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Fuel, ArrowLeft, CheckCircle2, Info } from 'lucide-react';
import { logTripAction } from './actions';

export default function LogTripPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await logTripAction(fd);
      if (result?.error) {
        setErrorMsg(result.error);
      } else {
        setDone(true);
      }
    });
  };

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="h-20 w-20 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-orange-600" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Trip Logged</h2>
          <p className="text-sm text-slate-500">Incident trip recorded for fuel tracking.</p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full max-w-xs bg-orange-500 hover:bg-orange-400 text-stone-900 font-black py-4 rounded-xl uppercase tracking-widest transition-all active:scale-95"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-5 space-y-6">
      {/* Header */}
      <header className="flex items-center gap-3 pt-2">
        <button onClick={() => router.back()} className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Log Trip</h1>
          <p className="text-sm text-slate-500 font-mono">Incident trip · fuel tracking</p>
        </div>
        <div className="ml-auto p-3 bg-orange-500/10 rounded-xl border border-orange-500/20">
          <Fuel className="w-5 h-5 text-orange-600" />
        </div>
      </header>

      {/* Info Banner */}
      <div className="flex items-start gap-3 bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4">
        <Info className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
        <p className="text-xs text-orange-600/80 font-bold leading-relaxed">
          Use this when you travel to a site for an emergency or incident — not a routine visit.
          This ensures accurate fuel reimbursement tracking.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Destination & Purpose */}
        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Trip Details</h2>

          <div>
            <label className="block text-sm font-bold text-slate-600 uppercase mb-2 tracking-wider">
              Destination / Site <span className="text-orange-500">*</span>
            </label>
            <input
              type="text"
              name="site_name"
              required
              placeholder="e.g. Lanka Hospitals"
              className="w-full bg-white border-2 border-slate-200 text-slate-900 px-4 py-3 rounded-xl font-mono focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 uppercase mb-2 tracking-wider">
              Incident / Purpose <span className="text-orange-500">*</span>
            </label>
            <textarea
              name="notes"
              rows={3}
              required
              placeholder="Describe the incident or reason for this emergency trip..."
              className="w-full bg-white border-2 border-slate-200 text-slate-900 px-4 py-3 rounded-xl font-mono text-sm resize-none focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Fuel / Distance */}
        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Fuel &amp; Distance</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 uppercase mb-2 tracking-wider">
                Distance (km)
              </label>
              <input
                type="number"
                name="km_claimed"
                min="0"
                step="0.1"
                placeholder="e.g. 24.5"
                className="w-full bg-white border-2 border-slate-200 text-slate-900 px-4 py-3 rounded-xl font-mono focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 uppercase mb-2 tracking-wider">
                Fuel Amount (LKR)
              </label>
              <input
                type="number"
                name="fuel_amount"
                min="0"
                step="0.01"
                placeholder="e.g. 1500.00"
                className="w-full bg-white border-2 border-slate-200 text-slate-900 px-4 py-3 rounded-xl font-mono focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all placeholder:text-slate-400"
              />
            </div>
          </div>
          <p className="text-sm text-slate-400 font-bold">Both fields optional. Fill what you have.</p>
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-sm text-center font-bold">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-orange-500 hover:bg-orange-400 text-stone-900 font-black py-4 rounded-xl uppercase tracking-widest text-base shadow-[0_8px_20px_rgba(249,115,22,0.25)] transition-all active:scale-95 disabled:opacity-40"
        >
          {isPending ? 'Logging...' : 'Log Incident Trip'}
        </button>
      </form>
    </div>
  );
}
