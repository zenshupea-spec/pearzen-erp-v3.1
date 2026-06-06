'use client';

import { useTransition } from 'react';
import { Calendar, Copy } from 'lucide-react';

export default function CafeRosterPage() {
  const [isPending, startTransition] = useTransition();

  const handleApplyMasterLayout = () => {
    startTransition(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      alert('✅ Master Weekly Template successfully applied to current week.');
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-slate-200 min-h-screen bg-neutral-950">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Calendar className="w-10 h-10 text-emerald-500" />
          <div>
            <h1 className="text-3xl font-black uppercase tracking-widest text-white">
              Café Tasha Schedule
            </h1>
            <p className="text-slate-400 uppercase text-sm tracking-widest">
              Hospitality Drag-and-Drop Matrix
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleApplyMasterLayout}
          disabled={isPending}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-colors uppercase tracking-wider disabled:opacity-50"
        >
          <Copy className="w-5 h-5" />
          {isPending ? 'Applying...' : 'Apply Master Layout'}
        </button>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center border-dashed">
        <h2 className="text-xl font-bold uppercase text-slate-500 mb-2">
          Weekly Matrix Loading...
        </h2>
        <p className="text-slate-600 text-sm max-w-lg mx-auto">
          The visual drag-and-drop calendar will render here. To save time,
          always apply the Master Layout first and only drag-and-drop exceptions
          or leave coverage.
        </p>
      </div>
    </div>
  );
}
