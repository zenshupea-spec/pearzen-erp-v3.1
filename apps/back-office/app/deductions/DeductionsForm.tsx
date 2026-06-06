'use client';

import { useState, useTransition } from 'react';
import { Calculator, AlertTriangle } from 'lucide-react';

import {
  submitManualDeduction,
  type DeductionGuardOption,
} from '../actions/deductions';

type Props = {
  guards: DeductionGuardOption[];
};

export default function DeductionsForm({ guards }: Props) {
  const [isPending, startTransition] = useTransition();
  const [guardId, setGuardId] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [appliedMonth, setAppliedMonth] = useState(
    new Date().toISOString().slice(0, 7) + '-01',
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardId || !category || !amount) {
      alert('Please fill required fields.');
      return;
    }

    startTransition(async () => {
      try {
        const result = await submitManualDeduction(
          guardId,
          category,
          parseFloat(amount),
          reason,
          appliedMonth,
        );
        if (result.success) {
          alert('Deduction applied to ledger.');
          setGuardId('');
          setCategory('');
          setAmount('');
          setReason('');
        }
      } catch {
        alert('Error submitting deduction.');
      }
    });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto font-sans text-slate-200 min-h-screen bg-neutral-950">
      <div className="flex items-center gap-3 mb-8">
        <Calculator className="w-10 h-10 text-amber-500" />
        <div>
          <h1 className="text-3xl font-black uppercase tracking-widest text-white">
            Manual Deductions
          </h1>
          <p className="text-slate-400 uppercase text-sm tracking-widest">
            Apply penalties, uniform costs, and fines
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 space-y-6 shadow-xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Select Guard
            </label>
            <select
              value={guardId}
              onChange={(e) => setGuardId(e.target.value)}
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-amber-500 outline-none uppercase"
            >
              <option value="" disabled>
                -- SELECT EMPLOYEE ({guards.length} active) --
              </option>
              {guards.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.empNumber})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Deduction Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-amber-500 outline-none uppercase"
            >
              <option value="" disabled>
                -- SELECT CATEGORY --
              </option>
              <option value="UNIFORM">Uniform Recovery</option>
              <option value="MEAL_OVERAGE">Meal Allowance Overage</option>
              <option value="DISCIPLINARY">Disciplinary Fine</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Amount (LKR)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-amber-500 outline-none font-mono"
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Target Payroll Month
            </label>
            <input
              type="date"
              value={appliedMonth}
              onChange={(e) => setAppliedMonth(e.target.value)}
              className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-amber-500 outline-none uppercase"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Reason / Notes (Optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-white focus:border-amber-500 outline-none uppercase resize-none"
            rows={3}
            placeholder="ENTER DETAILS HERE..."
          />
        </div>

        <button
          type="submit"
          disabled={isPending || guards.length === 0}
          className="w-full bg-amber-600 hover:bg-amber-500 text-white py-4 rounded-xl font-black text-lg tracking-widest uppercase transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
        >
          {isPending ? (
            'Processing...'
          ) : (
            <>
              <AlertTriangle className="w-5 h-5" /> Execute Deduction
            </>
          )}
        </button>
      </form>
    </div>
  );
}
