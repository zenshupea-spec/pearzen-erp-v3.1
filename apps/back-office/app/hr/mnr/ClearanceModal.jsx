"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X,
  ShieldCheck,
  Calendar,
  MapPin,
  Wallet,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileText,
} from "lucide-react";

import { terminateEmployee } from "../../actions/mnrActions";
import { confirmOffboardingPayment, getEmployeeClearance } from "./clearance-actions";

function isResignedEmployee(emp) {
  return (emp?.status || "").trim().toLowerCase() === "resigned";
}

function formatLKR(amount) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatLastDateWorked(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-LK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function retentionStyles(status) {
  if (status === "STOP_PAYMENT") {
    return {
      box: "bg-rose-50 border-rose-200 text-rose-800",
      Icon: Lock,
    };
  }
  if (status === "HALF_SALARY") {
    return {
      box: "bg-amber-50 border-amber-200 text-amber-800",
      Icon: AlertTriangle,
    };
  }
  return {
    box: "bg-emerald-50 border-emerald-200 text-emerald-800",
    Icon: CheckCircle2,
  };
}

export default function ClearanceModal({
  employee,
  onClose,
  canConfirm = false,
  onResignationConfirmed,
  summaryMode: summaryModeProp = false,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);
    setError("");
    try {
      const snapshot = await getEmployeeClearance(employee.id);
      setData(snapshot);
    } catch (err) {
      setError(err?.message || "Failed to load clearance data.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [employee?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!employee) return null;

  const alreadyResigned = isResignedEmployee(employee);
  const summaryMode = summaryModeProp || alreadyResigned;
  const resignationReady = data?.hrResignationGate?.ok === true;
  const canConfirmResignation =
    canConfirm && !alreadyResigned && !loading && !error && resignationReady;
  const payableToEmployee =
    (data?.settlement?.finalPayLkr ?? 0) + (data?.settlement?.gratuityLkr ?? 0);
  const needsPaymentConfirm =
    payableToEmployee > 0 &&
    !data?.fmOffboardingPaymentConfirmed &&
    !data?.hrResignationGate?.requiresDebtClearance;
  const canConfirmPayment =
    canConfirm &&
    !alreadyResigned &&
    !loading &&
    !error &&
    needsPaymentConfirm;

  async function handleConfirmPayment() {
    if (!employee?.id || !canConfirmPayment) return;
    const name = employee.full_name || "this employee";
    const net = data?.settlement?.netSettlementLkr ?? 0;
    if (
      !window.confirm(
        `Confirm final offboarding payment for ${name}?\n\nNet payable (after recoveries): ${formatLKR(Math.abs(net))}\n\nYou can confirm resignation after this.`
      )
    ) {
      return;
    }
    setConfirmingPayment(true);
    setActionError("");
    try {
      await confirmOffboardingPayment(employee.id);
      await load();
    } catch (err) {
      setActionError(err?.message || "Failed to confirm payment.");
    } finally {
      setConfirmingPayment(false);
    }
  }

  async function handleConfirmResignation() {
    if (!employee?.id || !data || !canConfirmResignation) return;
    const name = employee.full_name || "this employee";
    if (
      !window.confirm(
        `Confirm resignation for ${name}? Their status will be set to Resigned. This cannot be undone from this screen.`
      )
    ) {
      return;
    }
    setConfirming(true);
    setActionError("");
    try {
      await terminateEmployee(employee.id, "Resigned");
      onResignationConfirmed?.();
      onClose();
    } catch (err) {
      setActionError(err?.message || "Failed to confirm resignation.");
    } finally {
      setConfirming(false);
    }
  }

  const retention = data ? retentionStyles(data.retentionStatus) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div
          className={`flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0 ${
            summaryMode
              ? "bg-gradient-to-r from-white to-violet-50/60"
              : "bg-gradient-to-r from-white to-sky-50/50"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                summaryMode
                  ? "bg-violet-50 border border-violet-200"
                  : "bg-sky-50 border border-sky-200"
              }`}
            >
              {summaryMode ? (
                <FileText className="w-5 h-5 text-violet-600" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-sky-600" />
              )}
            </div>
            <div className="min-w-0">
              <p
                className={`text-xs font-black uppercase tracking-widest ${
                  summaryMode ? "text-violet-700" : "text-sky-700"
                }`}
              >
                {summaryMode ? "Clearance Summary" : "Offboarding Clearance"}
              </p>
              <p className="font-black text-slate-900 uppercase tracking-wide truncate">
                {employee.full_name}
              </p>
              <p className="text-xs text-slate-500 font-bold truncate">
                {employee.rank && <span>{employee.rank}</span>}
                {employee.rank && employee.site && " · "}
                {employee.site}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading && (
            <div className="flex flex-col items-center py-16 gap-3 text-slate-500">
              <Loader2 className={`w-8 h-8 animate-spin ${summaryMode ? "text-violet-500" : "text-sky-500"}`} />
              <p className="text-xs font-black uppercase tracking-widest">
                {summaryMode ? "Loading clearance summary…" : "Loading payroll & retention…"}
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
              {error}
            </div>
          )}

          {summaryMode && !loading && !error && (
            <p className="text-xs font-bold text-violet-800 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
              Read-only summary for a resigned employee. Figures are recalculated from current
              records when you open this view.
            </p>
          )}

          {!loading && data && (
            <>
              {summaryMode && (
                <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <SummaryTile
                    label="Net settlement"
                    value={formatLKR(Math.abs(data.settlement.netSettlementLkr))}
                    sub={
                      data.settlement.netSettlementLkr >= 0
                        ? "Payable to employee"
                        : "Owed to company"
                    }
                    tone={data.settlement.netSettlementLkr >= 0 ? "emerald" : "rose"}
                  />
                  <SummaryTile
                    label="Gratuity"
                    value={
                      data.gratuity?.applicable
                        ? formatLKR(data.settlement.gratuityLkr)
                        : "—"
                    }
                    sub={
                      data.gratuity?.applicable
                        ? `${data.gratuity.yearsOfService} yr(s) service`
                        : data.gratuity?.formulaNote || "Not applicable"
                    }
                    tone="violet"
                  />
                  <SummaryTile
                    label="Final payment"
                    value={data.fmOffboardingPaymentConfirmed ? "Confirmed" : "Not confirmed"}
                    sub={
                      data.fmOffboardingPaymentConfirmedAt
                        ? new Date(data.fmOffboardingPaymentConfirmedAt).toLocaleDateString("en-LK")
                        : "At time of review"
                    }
                    tone={data.fmOffboardingPaymentConfirmed ? "emerald" : "amber"}
                  />
                </section>
              )}

              <section>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Last month worked — {data.lastMonthLabel}
                </h3>
                <div className="mb-4 p-4 rounded-xl bg-sky-50 border border-sky-200">
                  <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest mb-1">
                    Last date worked
                  </p>
                  <p className="text-lg font-black text-slate-900 tabular-nums">
                    {formatLastDateWorked(data.lastDateWorked)}
                  </p>
                  {data.lastDateWorked && (
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5 font-mono">
                      {data.lastDateWorked}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <StatCard label="Shifts" value={String(data.lastMonthShiftCount)} />
                  <StatCard
                    label="Site"
                    value={data.primarySiteLastMonth || data.assignedSite || "—"}
                    small
                  />
                  <StatCard label="Gross (est.)" value={formatLKR(data.totalGrossLastMonthLkr)} />
                  <StatCard
                    label="Net take-home"
                    value={formatLKR(data.netTakeHomeLastMonthLkr)}
                  />
                </div>

                {data.lastMonthShifts.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-wider">
                            Site
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.lastMonthShifts.map((row) => (
                          <tr key={row.date} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono text-slate-700">{row.date}</td>
                            <td className="px-3 py-2 font-bold text-slate-600">{row.site}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 font-bold">
                    No shift records found for {data.lastMonthLabel} in attendance, SM portal, or time engine.
                  </p>
                )}
              </section>

              <section>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                  {summaryMode ? "Salary release (reference)" : "MD retention — salary release"} (
                  {data.currMonthLabel})
                </h3>
                <p className="text-[11px] text-slate-500 font-bold mb-3">
                  Thresholds: previous month ≥ {data.thresholds.prevMonthMinShifts} shifts · salary month ≥{" "}
                  {data.thresholds.salaryMonthMinShifts} shifts (FM / MD shared settings)
                </p>
                <div className={`p-4 rounded-xl border ${retention.box}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <retention.Icon className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wider">
                      {data.retentionLabel}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold leading-snug opacity-90">
                    {data.retentionReason}
                  </p>
                  <p className="text-[10px] font-bold mt-2 opacity-70 tabular-nums">
                    Prev month: {data.lastMonthShiftCount} shifts · Current: {data.currMonthShiftCount}{" "}
                    shifts
                  </p>
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  Final settlement
                </h3>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-sm font-black text-slate-700 uppercase">
                      Final pay (est.)
                    </span>
                    <span className="font-mono text-sm font-black text-slate-800 tabular-nums">
                      {formatLKR(data.settlement.finalPayLkr)}
                    </span>
                  </div>
                  {data.gratuity?.applicable && data.settlement.gratuityLkr > 0 && (
                    <div className="flex justify-between px-4 py-3 rounded-xl bg-violet-50 border border-violet-200">
                      <div>
                        <span className="text-sm font-black text-violet-900 uppercase">
                          Gratuity provision
                        </span>
                        <p className="text-[10px] font-bold text-violet-700/90 mt-0.5 normal-case">
                          {data.gratuity.yearsOfService} yr(s) · {data.gratuity.formulaNote}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-black text-violet-800 tabular-nums shrink-0">
                        + {formatLKR(data.settlement.gratuityLkr)}
                      </span>
                    </div>
                  )}
                  {!data.gratuity?.applicable && data.gratuity?.formulaNote && (
                    <p className="text-[11px] font-bold text-slate-500 px-1">
                      Gratuity: {data.gratuity.formulaNote}
                    </p>
                  )}
                  <div className="flex justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-sm font-black text-slate-700 uppercase">
                      Less recoveries
                    </span>
                    <span className="font-mono text-sm font-black text-rose-600 tabular-nums">
                      − {formatLKR(data.settlement.recoveryLkr)}
                    </span>
                  </div>
                  <div
                    className={`flex justify-between px-4 py-3 rounded-xl border ${
                      data.settlement.netSettlementLkr >= 0
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-rose-50 border-rose-200"
                    }`}
                  >
                    <span
                      className={`text-sm font-black uppercase ${
                        data.settlement.netSettlementLkr >= 0
                          ? "text-emerald-800"
                          : "text-rose-800"
                      }`}
                    >
                      {data.settlement.netSettlementLkr >= 0
                        ? "Net payable to employee"
                        : "Net owed to company"}
                    </span>
                    <span
                      className={`font-mono text-sm font-black tabular-nums ${
                        data.settlement.netSettlementLkr >= 0
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {formatLKR(Math.abs(data.settlement.netSettlementLkr))}
                    </span>
                  </div>
                </div>

                {data.fmOffboardingPaymentConfirmed ? (
                  <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Final payment confirmed
                    {data.fmOffboardingPaymentConfirmedAt && (
                      <span className="text-[10px] font-bold text-emerald-600/80 normal-case">
                        · {new Date(data.fmOffboardingPaymentConfirmedAt).toLocaleString("en-LK")}
                      </span>
                    )}
                  </p>
                ) : !summaryMode && needsPaymentConfirm ? (
                  <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    Confirm final payment here after pending recoveries are settled, then confirm
                    resignation.
                  </p>
                ) : summaryMode && !data.fmOffboardingPaymentConfirmed ? (
                  <p className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    Final payment was not marked confirmed on file at the time this summary was loaded.
                  </p>
                ) : null}

                {data.unsettledBalances.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Recovery line items
                    </p>
                    {data.unsettledBalances.map((line, i) => (
                      <div
                        key={`${line.type}-${i}`}
                        className="flex justify-between items-start gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200"
                      >
                        <div>
                          <p className="text-sm font-black text-slate-800">{line.label}</p>
                          {line.detail && (
                            <p className="text-[11px] text-slate-500 font-bold mt-0.5">{line.detail}</p>
                          )}
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                            {line.source === "fm_ledger" ? "FM ledger" : "Database"}
                          </p>
                        </div>
                        <span className="font-mono text-sm font-black text-rose-600 tabular-nums shrink-0">
                          {formatLKR(line.amountLkr)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {data.unsettledBalances.length === 0 && data.settlement.recoveryLkr === 0 && (
                  <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mt-2">
                    No open uniform, meals, advance, or penalty balances on file.
                  </p>
                )}
              </section>

              {data.primarySiteLastMonth && (
                <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Primary site last month: {data.primarySiteLastMonth}
                </p>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 p-4 bg-slate-50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            {actionError && (
              <p className="text-xs font-bold text-red-700">{actionError}</p>
            )}
            {!actionError && summaryMode && data && (
              <p className="text-xs font-bold text-violet-700 leading-snug">
                Resigned — clearance summary for audit and payroll reference. Last worked{" "}
                {formatLastDateWorked(data.lastDateWorked)} · Net{" "}
                {data.settlement.netSettlementLkr >= 0 ? "payable" : "balance owed"}:{" "}
                {formatLKR(Math.abs(data.settlement.netSettlementLkr))}
                {data.settlement.gratuityLkr > 0
                  ? ` (incl. gratuity ${formatLKR(data.settlement.gratuityLkr)})`
                  : ""}
                .
              </p>
            )}
            {!actionError && !alreadyResigned && data && !resignationReady && (
              <p
                className={`text-xs font-bold ${
                  data.hrResignationGate.requiresFmPaymentConfirm
                    ? "text-amber-800"
                    : "text-rose-700"
                }`}
              >
                {data.hrResignationGate.message}
              </p>
            )}
            {!actionError && !alreadyResigned && data && resignationReady && canConfirm && (
              <p className="text-xs font-bold text-emerald-700">
                {data.hrResignationGate.message}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              disabled={confirming || confirmingPayment}
              className="px-5 py-2.5 text-xs font-black uppercase tracking-wide rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {summaryMode ? "Close summary" : "Close"}
            </button>
            {canConfirmPayment && (
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={confirmingPayment || confirming}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-wide rounded-xl bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {confirmingPayment ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Confirming…
                  </>
                ) : (
                  <>
                    <Wallet className="w-3.5 h-3.5" />
                    Confirm final payment
                  </>
                )}
              </button>
            )}
            {canConfirm && !summaryMode && (
              <button
                type="button"
                onClick={handleConfirmResignation}
                disabled={!canConfirmResignation || confirming || confirmingPayment}
                title={!resignationReady && data ? data.hrResignationGate.message : undefined}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-wide rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {confirming ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Confirming…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirm resignation
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, small }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p
        className={`font-black text-slate-900 tabular-nums ${small ? "text-xs leading-snug" : "text-lg"}`}
      >
        {value}
      </p>
    </div>
  );
}

function SummaryTile({ label, value, sub, tone }) {
  const tones = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    rose: "bg-rose-50 border-rose-200 text-rose-900",
    violet: "bg-violet-50 border-violet-200 text-violet-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
  };
  return (
    <div className={`p-4 rounded-xl border ${tones[tone] || tones.violet}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">{label}</p>
      <p className="text-base font-black tabular-nums truncate">{value}</p>
      {sub && (
        <p className="text-[10px] font-bold mt-1 opacity-80 leading-snug normal-case">{sub}</p>
      )}
    </div>
  );
}
