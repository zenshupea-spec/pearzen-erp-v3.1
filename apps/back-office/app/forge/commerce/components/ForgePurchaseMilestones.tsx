'use client';

import { useEffect, useState, useTransition } from 'react';

import { milestoneStatusLabel } from '../../../../lib/forge-commerce';
import { formatLkr } from '../../../../lib/saas-billing';
import { FORGE_COMMERCE_THEME as C } from '../../components/forge-commerce-theme';
import {
  addForgeProjectMilestone,
  fetchForgeProjectMilestones,
  invoiceForgeProjectMilestone,
} from '../actions';

type Props = {
  purchaseId: string;
  contractTotalLkr: number;
};

export default function ForgePurchaseMilestones({ purchaseId, contractTotalLkr }: Props) {
  const [open, setOpen] = useState(false);
  const [milestones, setMilestones] = useState<
    Awaited<ReturnType<typeof fetchForgeProjectMilestones>>['milestones']
  >([]);
  const [title, setTitle] = useState('');
  const [amountLkr, setAmountLkr] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    const result = await fetchForgeProjectMilestones(purchaseId);
    if (result.success) setMilestones(result.milestones);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchaseId]);

  const scheduledTotal = milestones.reduce((sum, m) => sum + m.amountLkr, 0);

  const handleAdd = () => {
    startTransition(async () => {
      setMessage(null);
      const result = await addForgeProjectMilestone({
        purchaseId,
        title,
        amountLkr: Number(amountLkr),
        dueDate: dueDate || null,
      });
      if (!result.success) {
        setMessage(result.error ?? 'Failed to add milestone');
        return;
      }
      setTitle('');
      setAmountLkr('');
      setDueDate('');
      await load();
    });
  };

  const handleInvoice = (milestoneId: string) => {
    startTransition(async () => {
      setMessage(null);
      const result = await invoiceForgeProjectMilestone(milestoneId, true);
      if (!result.success) {
        setMessage(result.error ?? 'Failed to invoice milestone');
        return;
      }
      setMessage(
        result.emailWarning
          ? `Milestone invoiced · ${result.emailWarning}`
          : 'Milestone invoiced and emailed.',
      );
      await load();
    });
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] font-bold uppercase tracking-wider text-amber-700 hover:text-amber-900"
      >
        {open ? 'Hide milestones' : 'Milestones'}
      </button>

      {open ? (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {message ? <p className="text-xs text-emerald-700">{message}</p> : null}

          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            Contract {formatLkr(contractTotalLkr)} · scheduled {formatLkr(scheduledTotal)}
          </p>

          {milestones.length === 0 ? (
            <p className="text-xs text-slate-500">No milestones yet — add phases below.</p>
          ) : (
            <ul className="space-y-2">
              {milestones.map((milestone) => (
                <li
                  key={milestone.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{milestone.title}</p>
                    <p className="text-slate-500">
                      {formatLkr(milestone.amountLkr)}
                      {milestone.dueDate ? ` · due ${milestone.dueDate}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                      {milestoneStatusLabel(milestone.status)}
                    </span>
                    {milestone.status === 'pending' ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleInvoice(milestone.id)}
                        className="text-[10px] font-bold uppercase tracking-wider text-violet-600 hover:text-violet-800 disabled:opacity-50"
                      >
                        Invoice
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Phase title"
              className={`${C.inputCompact} text-xs`}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={amountLkr}
              onChange={(e) => setAmountLkr(e.target.value)}
              placeholder="Amount LKR"
              className={`${C.inputCompact} text-xs`}
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`${C.inputCompact} text-xs`}
            />
          </div>

          <button
            type="button"
            disabled={isPending || !title.trim() || !amountLkr}
            onClick={handleAdd}
            className="text-[10px] font-bold uppercase tracking-wider text-amber-700 hover:text-amber-900 disabled:opacity-50"
          >
            Add milestone
          </button>
        </div>
      ) : null}
    </div>
  );
}
