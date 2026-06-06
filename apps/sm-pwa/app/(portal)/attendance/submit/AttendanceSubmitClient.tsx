'use client'

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, ArrowLeft, CheckCircle2, Clock } from 'lucide-react';
import { submitAttendanceAction } from './actions';

const SHIFT_TYPES = [
  { value: 'DAY', label: 'Day Shift', sub: '07:00 – 19:00' },
  { value: 'NIGHT', label: 'Night Shift', sub: '19:00 – 07:00' },
  { value: 'SPLIT', label: 'Split Shift', sub: 'Multiple windows' },
  { value: 'REST', label: 'Rest Day', sub: 'Off duty' },
];

interface Submission {
  shift_date: string;
  shift_type: string;
  status: string;
  site_name: string | null;
}

export default function AttendanceSubmitClient({
  defaultSite,
  existing,
}: {
  defaultSite: string;
  existing: Submission[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);
  const [shiftType, setShiftType] = useState('DAY');

  // Build next 3 days options
  const days = Array.from({ length: 4 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const label = i === 0
      ? `Today · ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
      : i === 1
        ? `Tomorrow · ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
        : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    const alreadySubmitted = existing.find(e => e.shift_date === iso);
    return { iso, label, alreadySubmitted };
  });

  const [selectedDay, setSelectedDay] = useState(days[0].iso);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    const fd = new FormData(e.currentTarget);
    fd.set('shift_type', shiftType);
    fd.set('shift_date', selectedDay);
    startTransition(async () => {
      const result = await submitAttendanceAction(fd);
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
        <div className="h-20 w-20 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-sky-600" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Attendance Submitted</h2>
          <p className="text-sm text-slate-500">Your shift has been logged for review.</p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full max-w-xs bg-sky-500 hover:bg-sky-400 text-stone-900 font-black py-4 rounded-xl uppercase tracking-widest transition-all active:scale-95"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-5 space-y-6">
      <header className="flex items-center gap-3 pt-2">
        <button onClick={() => router.back()} className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Submit Attendance</h1>
          <p className="text-sm text-slate-500 font-mono">Up to 3 days in advance</p>
        </div>
        <div className="ml-auto p-3 bg-sky-500/10 rounded-xl border border-sky-500/20">
          <CalendarPlus className="w-5 h-5 text-sky-600" />
        </div>
      </header>

      {/* Already submitted summary */}
      {existing.length > 0 && (
        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Upcoming Submissions</p>
          {existing.map(e => (
            <div key={e.shift_date} className="flex items-center justify-between text-xs">
              <span className="font-mono text-slate-600">{e.shift_date}</span>
              <span className={`font-black uppercase px-2 py-0.5 rounded-full text-xs ${
                e.status === 'CONFIRMED'
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                  : 'bg-sky-500/10 text-sky-600 border border-sky-500/20'
              }`}>{e.shift_type} · {e.status}</span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Date Selection */}
        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Select Date</h2>
          <div className="space-y-2">
            {days.map(({ iso, label, alreadySubmitted }) => (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDay(iso)}
                className={`w-full p-3 rounded-xl border text-left transition-all active:scale-95 ${
                  selectedDay === iso
                    ? 'bg-sky-500/15 border-sky-500/50 text-sky-600'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{label}</span>
                  {alreadySubmitted && (
                    <span className="text-sm font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      Already submitted
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Shift Type */}
        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Shift Type</h2>
          <div className="grid grid-cols-2 gap-3">
            {SHIFT_TYPES.map(st => (
              <button
                key={st.value}
                type="button"
                onClick={() => setShiftType(st.value)}
                className={`p-3 rounded-xl border text-left transition-all active:scale-95 ${
                  shiftType === st.value
                    ? 'bg-sky-500/15 border-sky-500/50'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className={`text-sm font-black uppercase tracking-tight ${shiftType === st.value ? 'text-sky-600' : 'text-slate-700'}`}>
                  {st.label}
                </p>
                <p className="text-sm text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" />{st.sub}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Site + Notes */}
        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Details</h2>
          <div>
            <label className="block text-sm font-bold text-slate-600 uppercase mb-2 tracking-wider">Site</label>
            <input
              type="text"
              name="site_name"
              defaultValue={defaultSite}
              placeholder="e.g. Lanka Hospitals"
              className="w-full bg-white border-2 border-slate-200 text-slate-900 px-4 py-3 rounded-xl font-mono focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 uppercase mb-2 tracking-wider">Notes</label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Optional remarks..."
              className="w-full bg-white border-2 border-slate-200 text-slate-900 px-4 py-3 rounded-xl font-mono text-sm resize-none focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all placeholder:text-slate-400"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-sm text-center font-bold">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-sky-500 hover:bg-sky-400 text-stone-900 font-black py-4 rounded-xl uppercase tracking-widest text-base shadow-[0_8px_20px_rgba(14,165,233,0.25)] transition-all active:scale-95 disabled:opacity-40"
        >
          {isPending ? 'Submitting...' : 'Submit Attendance'}
        </button>
      </form>
    </div>
  );
}
