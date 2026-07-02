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
  RotateCcw,
} from "lucide-react";

import { terminateEmployee } from "../../actions/mnrActions";
import { getEmployeeClearance } from "./clearance-actions";
import { requestUniformCollection } from "./uniform-collection-actions";

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

function buildResignConfirmMessage(employee, data) {
  const name = employee.full_name || "this employee";
  const net = data.settlement.netSettlementLkr;
  const recovery = data.settlement.recoveryLkr;
  const lines = [
    `Confirm clearance and resignation for ${name}?`,
    "",
    `Net settlement: ${formatLKR(Math.abs(net))} ${net >= 0 ? "payable to employee" : "owed to company"}.`,
  ];
  if (recovery > 0) {
    lines.push(`Recoveries on file: ${formatLKR(recovery)} — confirm you have settled or recorded these.`);
  }
  if (data.settlement.gratuityLkr > 0) {
    lines.push(`Includes gratuity: ${formatLKR(data.settlement.gratuityLkr)}.`);
  }
  lines.push("", "Status will be set to Resigned. This cannot be undone here.");
  return lines.join("\n");
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
  const [requestingCollection, setRequestingCollection] = useState(false);
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
  const uniformCollection = data?.uniformCollection;
  const canConfirmResignation =
    canConfirm && !alreadyResigned && !loading && !error && resignationReady;
  const canRequestUniformCollection =
    canConfirm &&
    !summaryMode &&
    !loading &&
    !error &&
    uniformCollection?.required &&
    !uniformCollection?.isCollected &&
    !uniformCollection?.isPending;

  async function handleRequestUniformCollection() {
    if (!employee?.id || !canRequestUniformCollection) return;
    const name = employee.full_name || "this employee";
    if (
      !window.confirm(
        `Request Deductions Admin to collect uniforms for ${name}?\n\nIssued items on file will be queued for physical return confirmation.`
      )
    ) {
      return;
    }
    setRequestingCollection(true);
    setActionError("");
    try {
      const result = await requestUniformCollection(employee.id);
      if (!result.success) {
        throw new Error(result.error || "Failed to request uniform collection.");
      }
      await load();
    } catch (err) {
      setActionError(err?.message || "Failed to request uniform collection.");
    } finally {
      setRequestingCollection(false);
    }
  }

  async function handleConfirmResignation() {
    if (!employee?.id || !data || !canConfirmResignation) return;
    if (!window.confirm(buildResignConfirmMessage(employee, data))) {
      return;
    }
    setConfirming(true);
    setActionError("");
    try {
      await terminateEmployee(employee.id, "Resigned");
      onResignationConfirmed?.();
      onClose();
    } catch (err) {
      setActionError(err?.message || "Failed to confirm clearance.");
    } finally {
      setConfirming(false);
    }
  }

  const retention = data ? retentionStyles(data.retentionStatus) : null;
  const busy = confirming || requestingCollection;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex h-[100dvh] w-full max-h-[100dvh] flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl">
        <div
          className={`flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4 ${
            summaryMode
              ? "bg-gradient-to-r from-white to-violet-50/60"
              : "bg-gradient-to-r from-white to-sky-50/50"
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`shrink-0 rounded-xl p-2 ${
                summaryMode
                  ? "border border-violet-200 bg-violet-50"
                  : "border border-sky-200 bg-sky-50"
              }`}
            >
              {summaryMode ? (
                <FileText className="h-5 w-5 text-violet-600" />
              ) : (
                <ShieldCheck className="h-5 w-5 text-sky-600" />
              )}
            </div>
            <div className="min-w-0">
              <p
                className={`text-[10px] font-black uppercase tracking-widest sm:text-xs ${
                  summaryMode ? "text-violet-700" : "text-sky-700"
                }`}
              >
                {summaryMode ? "Clearance Summary" : "Clearance & Resignation"}
              </p>
              <p className="truncate font-black uppercase tracking-wide text-slate-900">
                {employee.full_name}
              </p>
              <p className="truncate text-[11px] font-bold text-slate-500">
                {[employee.rank, employee.site].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
              <Loader2
                className={`h-8 w-8 animate-spin ${summaryMode ? "text-violet-500" : "text-sky-500"}`}
              />
              <p className="text-xs font-black uppercase tracking-widest">Loading clearance…</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          {summaryMode && !loading && !error && (
            <p className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs font-bold text-violet-800">
              Read-only summary for a resigned employee.
            </p>
          )}

          {!loading && data && (
            <>
              {summaryMode && (
                <section className="grid grid-cols-1 gap-3 xs:grid-cols-3">
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
                    label="Clearance"
                    value={data.fmOffboardingPaymentConfirmed ? "Completed" : "Not recorded"}
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
                <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <Calendar className="h-3.5 w-3.5" />
                  Last month — {data.lastMonthLabel}
                </h3>
                <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-sky-700">
                    Last date worked
                  </p>
                  <p className="text-lg font-black tabular-nums text-slate-900">
                    {formatLastDateWorked(data.lastDateWorked)}
                  </p>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                  <StatCard label="Shifts" value={String(data.lastMonthShiftCount)} />
                  <StatCard
                    label="Site"
                    value={data.primarySiteLastMonth || data.assignedSite || "—"}
                    small
                  />
                  <StatCard label="Gross (est.)" value={formatLKR(data.totalGrossLastMonthLkr)} />
                  <StatCard label="Net take-home" value={formatLKR(data.netTakeHomeLastMonthLkr)} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Salary release ({data.currMonthLabel})
                </h3>
                <div className={`rounded-xl border p-4 ${retention.box}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <retention.Icon className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wider">
                      {data.retentionLabel}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold leading-snug opacity-90">{data.retentionReason}</p>
                </div>
              </section>

              <section>
                <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <Wallet className="h-3.5 w-3.5" />
                  Final settlement
                </h3>

                <div className="space-y-2">
                  <SettlementRow label="Final pay (est.)" value={formatLKR(data.settlement.finalPayLkr)} />
                  {data.gratuity?.applicable && data.settlement.gratuityLkr > 0 && (
                    <SettlementRow
                      label="Gratuity"
                      value={`+ ${formatLKR(data.settlement.gratuityLkr)}`}
                      tone="violet"
                    />
                  )}
                  <SettlementRow
                    label="Less recoveries"
                    value={`− ${formatLKR(data.settlement.recoveryLkr)}`}
                    tone="rose"
                  />
                  <div
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                      data.settlement.netSettlementLkr >= 0
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-rose-200 bg-rose-50"
                    }`}
                  >
                    <span
                      className={`text-sm font-black uppercase ${
                        data.settlement.netSettlementLkr >= 0 ? "text-emerald-800" : "text-rose-800"
                      }`}
                    >
                      {data.settlement.netSettlementLkr >= 0 ? "Net payable" : "Net owed"}
                    </span>
                    <span
                      className={`shrink-0 font-mono text-sm font-black tabular-nums ${
                        data.settlement.netSettlementLkr >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {formatLKR(Math.abs(data.settlement.netSettlementLkr))}
                    </span>
                  </div>
                </div>

                {uniformCollection?.required && (
                  <section className="mt-4">
                    <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Uniform collection
                    </h3>
                    {uniformCollection.isCollected ? (
                      <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        Uniforms collected
                      </p>
                    ) : uniformCollection.isPending ? (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                        Awaiting Deductions Admin collection confirmation.
                      </p>
                    ) : !summaryMode ? (
                      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
                        Issued uniforms on file — request collection before confirming clearance.
                      </p>
                    ) : null}
                  </section>
                )}

                {data.unsettledBalances.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Recovery items
                    </p>
                    {data.unsettledBalances.map((line, i) => (
                      <div
                        key={`${line.type}-${i}`}
                        className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800">{line.label}</p>
                          {line.detail && (
                            <p className="mt-0.5 text-[11px] font-bold text-slate-500">{line.detail}</p>
                          )}
                        </div>
                        <span className="shrink-0 font-mono text-sm font-black tabular-nums text-rose-600">
                          {formatLKR(line.amountLkr)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {data.unsettledBalances.length === 0 && data.settlement.recoveryLkr === 0 && (
                  <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
                    No open balances on file.
                  </p>
                )}
              </section>

              {data.primarySiteLastMonth && (
                <p className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                  <MapPin className="h-3 w-3" />
                  Primary site: {data.primarySiteLastMonth}
                </p>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {actionError && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              {actionError}
            </p>
          )}

          {!actionError && !summaryMode && data && !resignationReady && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-900">
              {data.hrResignationGate.message}
            </p>
          )}

          {!actionError && !summaryMode && data && resignationReady && canConfirm && (
            <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold leading-relaxed text-emerald-800">
              {data.hrResignationGate.message}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="w-full rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:w-auto sm:py-2.5"
            >
              {summaryMode ? "Close" : "Cancel"}
            </button>

            {canRequestUniformCollection && (
              <button
                type="button"
                onClick={handleRequestUniformCollection}
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-amber-700 disabled:opacity-50 sm:w-auto sm:py-2.5"
              >
                {requestingCollection ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Requesting…
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Request uniform collection
                  </>
                )}
              </button>
            )}

            {canConfirm && !summaryMode && (
              <button
                type="button"
                onClick={handleConfirmResignation}
                disabled={!canConfirmResignation || busy}
                title={!resignationReady && data ? data.hrResignationGate.message : undefined}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3.5 text-xs font-black uppercase tracking-wide text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:py-2.5"
              >
                {confirming ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Confirming…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirm clearance &amp; resignation
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
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p
        className={`font-black tabular-nums text-slate-900 ${small ? "text-xs leading-snug" : "text-base sm:text-lg"}`}
      >
        {value}
      </p>
    </div>
  );
}

function SettlementRow({ label, value, tone }) {
  const tones = {
    violet: "bg-violet-50 border-violet-200 text-violet-800",
    rose: "text-rose-600",
  };
  if (tone === "rose") {
    return (
      <div className="flex justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <span className="text-sm font-black uppercase text-slate-700">{label}</span>
        <span className={`font-mono text-sm font-black tabular-nums ${tones.rose}`}>{value}</span>
      </div>
    );
  }
  return (
    <div className={`flex justify-between rounded-xl border px-4 py-3 ${tones[tone] || "border-slate-200 bg-slate-50"}`}>
      <span className="text-sm font-black uppercase text-slate-700">{label}</span>
      <span className="font-mono text-sm font-black tabular-nums text-slate-800">{value}</span>
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
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.violet}`}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest opacity-70">{label}</p>
      <p className="truncate text-base font-black tabular-nums">{value}</p>
      {sub && (
        <p className="mt-1 text-[10px] font-bold leading-snug opacity-80 normal-case">{sub}</p>
      )}
    </div>
  );
}
