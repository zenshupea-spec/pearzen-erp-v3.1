'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { CheckCircle2, Loader2, Send, ShieldCheck, Wallet } from 'lucide-react';
import FmSubnav from '../components/FmSubnav';
import {
  confirmFmOffboardingPayment,
  listFmOffboardingQueue,
  type FmOffboardingQueueRow,
} from '../offboarding-actions';

function formatLKR(amount: number) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatSentAt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FmOffboardingPage() {
  const [rows, setRows] = useState<FmOffboardingQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listFmOffboardingQueue());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleConfirm(row: FmOffboardingQueueRow) {
    if (row.blockedByDebt) {
      window.alert(row.blockMessage ?? 'Settle recoveries before confirming payment.');
      return;
    }
    const netLabel = formatLKR(row.netSettlementLkr);
    if (
      !window.confirm(
        `Confirm final offboarding payment for ${row.fullName}?\n\nNet payable to employee: ${netLabel}\n\nHR can confirm resignation after this.`,
      )
    ) {
      return;
    }
    setConfirmingId(row.employeeId);
    startTransition(async () => {
      try {
        await confirmFmOffboardingPayment(row.employeeId);
        await load();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Confirmation failed.');
      } finally {
        setConfirmingId(null);
      }
    });
  }

  const awaitingFm = rows.filter((r) => r.needsFmConfirm && !r.blockedByDebt);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 pb-24">
      <FmSubnav />

      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
              Offboarding settlements
            </h1>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              HR sends cases here — confirm net pay after pending recoveries are settled
            </p>
          </div>
        </div>
        {awaitingFm.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-800 border border-amber-200">
            {awaitingFm.length} awaiting FM
          </span>
        )}
      </header>

      {loading && (
        <div className="flex flex-col items-center py-20 gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          <p className="text-xs font-black uppercase tracking-widest">Loading queue…</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 space-y-2">
          <p className="font-black uppercase text-slate-900">Queue empty</p>
          <p className="font-semibold leading-relaxed">
            When HR opens offboarding clearance on MNR and sends a case to Finance, it will
            appear here. Settle any pending recoveries (uniform, meals, advances, penalties),
            then confirm final net payment so HR can mark the guard as resigned.
          </p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-4">
          {rows.map((row) => (
            <article
              key={row.employeeId}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-lg font-black uppercase text-slate-900">{row.fullName}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase">
                    {row.empNo ?? '—'}
                    {row.rank ? ` · ${row.rank}` : ''}
                  </p>
                  {row.hrSentToFmAt && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 uppercase">
                      <Send className="w-3 h-3" />
                      HR sent {formatSentAt(row.hrSentToFmAt)}
                    </p>
                  )}
                </div>
                {row.fmOffboardingPaymentConfirmed ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[10px] font-black uppercase text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Payment confirmed
                  </span>
                ) : row.blockedByDebt ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-[10px] font-black uppercase text-rose-800">
                    Recoveries pending
                  </span>
                ) : row.needsFmConfirm ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-[10px] font-black uppercase text-amber-800">
                    <Wallet className="w-3.5 h-3.5" />
                    Awaiting FM
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
                <SettlementCell label="Final pay (est.)" value={formatLKR(row.finalPayLkr)} tone="slate" />
                <SettlementCell
                  label="Gratuity"
                  value={formatLKR(row.gratuityLkr)}
                  tone="violet"
                />
                <SettlementCell
                  label="Recoveries"
                  value={formatLKR(row.recoveryLkr)}
                  tone="rose"
                />
                <SettlementCell
                  label="Net to employee"
                  value={formatLKR(row.netSettlementLkr)}
                  tone={row.netSettlementLkr >= 0 ? 'emerald' : 'rose'}
                />
              </div>

              {row.unsettledBalances.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Pending to settle (recoveries)
                  </p>
                  {row.unsettledBalances.map((line, i) => (
                    <div
                      key={`${line.type}-${i}`}
                      className="flex justify-between items-start gap-3 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                    >
                      <div>
                        <p className="text-xs font-black text-slate-800">{line.label}</p>
                        {line.detail && (
                          <p className="text-[10px] font-bold text-slate-500">{line.detail}</p>
                        )}
                      </div>
                      <span className="font-mono text-xs font-black text-rose-700 tabular-nums shrink-0">
                        {formatLKR(line.amountLkr)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {row.blockedByDebt && row.blockMessage && (
                <p className="mt-4 text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                  {row.blockMessage}
                </p>
              )}

              {row.needsFmConfirm && !row.fmOffboardingPaymentConfirmed && (
                <button
                  type="button"
                  disabled={
                    row.blockedByDebt || (pending && confirmingId === row.employeeId)
                  }
                  onClick={() => handleConfirm(row)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pending && confirmingId === row.employeeId ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Confirming…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Confirm payment — unlock HR resignation
                    </>
                  )}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function SettlementCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'rose' | 'emerald' | 'violet';
}) {
  const styles =
    tone === 'rose'
      ? 'bg-rose-50 border-rose-200 text-rose-800'
      : tone === 'emerald'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
        : tone === 'violet'
          ? 'bg-violet-50 border-violet-200 text-violet-800'
          : 'bg-slate-50 border-slate-200 text-slate-800';

  return (
    <div className={`rounded-xl border px-4 py-3 ${styles}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</p>
      <p className="font-mono font-black tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
