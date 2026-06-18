'use client';

import { useState } from 'react';
import { ClipboardList, Mail, Send } from 'lucide-react';

import {
  type EstimatorInput,
  type LocationTier,
  type ServiceType,
  type ShiftCoverage,
} from '../../../lib/security-website-calculator';
import {
  SECURITY_SERVICE_SLUGS,
  SERVICE_SLUG_TO_TYPE,
} from '../../../lib/security-website-catalog';
import type { SecurityWebsiteRankClientRate } from '../../../lib/security-website-types';
import { useSecurityWebsite } from './SecurityWebsiteContext';

type Props = {
  initial?: Partial<EstimatorInput>;
  showEmailCapture?: boolean;
  editing?: boolean;
  rankClientRates?: SecurityWebsiteRankClientRate[];
  onRankClientRatesChange?: (rates: SecurityWebsiteRankClientRate[]) => void;
};

function buildDefaultRankQuantities(
  guardRankCodes: string[],
): Record<string, number> {
  const qty: Record<string, number> = {};
  const primary = guardRankCodes.find((c) => c === 'JSO') ?? guardRankCodes[0];
  if (primary) qty[primary] = 2;
  return qty;
}

const DEFAULT_INPUT: EstimatorInput = {
  serviceType: 'static',
  locationTier: 'colombo',
  guardsPerShift: 2,
  rankQuantities: {},
  shiftCoverage: 'both',
  hoursPerShift: 12,
  contractMonths: 12,
  armed: false,
  supervisor: false,
};

function buildServiceTypeLabels(
  services: { slug?: string; title: string }[],
  ui: ReturnType<typeof useSecurityWebsite>['ui'],
): Record<ServiceType, string> {
  const labels: Record<ServiceType, string> = {
    static: ui.static,
    patrol: ui.patrol,
    corporate: ui.corporate,
    event: ui.event,
  };

  for (const slug of SECURITY_SERVICE_SLUGS) {
    const type = SERVICE_SLUG_TO_TYPE[slug];
    const service = services.find((item) => item.slug === slug);
    if (service?.title?.trim()) {
      labels[type] = service.title.trim();
    }
  }

  return labels;
}

function shiftCoverageLabel(coverage: ShiftCoverage, ui: ReturnType<typeof useSecurityWebsite>['ui']) {
  if (coverage === 'day') return ui.shiftDayOnly;
  if (coverage === 'night') return ui.shiftNightOnly;
  return ui.shiftBoth;
}

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100';

const labelClass = 'text-xs font-bold uppercase tracking-wide text-slate-600';

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-[0.15em] text-slate-800">
      {children}
    </h3>
  );
}

export default function SecurityCostEstimator({
  initial,
  showEmailCapture,
  editing,
  rankClientRates,
  onRankClientRatesChange,
}: Props) {
  const { content, guardRanks, ui, quoteRecipientEmails } = useSecurityWebsite();
  const guardRankCodes = guardRanks.map((r) => r.rankCode);
  const rates = rankClientRates ?? content.rateCard.rankClientRates;

  const [input, setInput] = useState<EstimatorInput>(() => {
    const base = { ...DEFAULT_INPUT, ...initial };
    if (!initial?.rankQuantities || Object.keys(initial.rankQuantities).length === 0) {
      base.rankQuantities = buildDefaultRankQuantities(guardRankCodes);
    }
    return base;
  });
  const [email, setEmail] = useState('');
  const [customRequest, setCustomRequest] = useState('');

  const serviceTypeLabels = buildServiceTypeLabels(content.services, ui);
  const serviceLabel = serviceTypeLabels[input.serviceType];

  const locationLabel = {
    colombo: ui.colombo,
    greaterColombo: ui.greaterColombo,
    other: ui.otherDistrict,
  }[input.locationTier];

  const totalGuards = Object.values(input.rankQuantities).reduce(
    (sum, qty) => sum + (qty > 0 ? qty : 0),
    0,
  );
  const guardsForQuote = totalGuards > 0 ? totalGuards : input.guardsPerShift;

  const activeRanks = guardRanks
    .map((rank) => ({
      rankCode: rank.rankCode,
      fullTitle: rank.fullTitle,
      qty: input.rankQuantities[rank.rankCode] ?? 0,
    }))
    .filter((rank) => rank.qty > 0);

  const rankSummaryLines =
    activeRanks.length > 0
      ? activeRanks.map((rank) => `${rank.rankCode} (${rank.fullTitle}): ${rank.qty}`)
      : [`${ui.totalGuardsPerShift}: ${guardsForQuote}`];

  const setRankQty = (rankCode: string, qty: number) => {
    setInput((prev) => ({
      ...prev,
      rankQuantities: { ...prev.rankQuantities, [rankCode]: Math.max(0, qty) },
    }));
  };

  const clientRateFor = (rankCode: string) =>
    rates.find((r) => r.rankCode === rankCode)?.clientRatePerShift ?? 0;

  const patchClientRate = (rankCode: string, clientRatePerShift: number) => {
    if (!onRankClientRatesChange) return;
    const next = [...rates];
    const idx = next.findIndex((r) => r.rankCode === rankCode);
    if (idx >= 0) {
      next[idx] = { ...next[idx], clientRatePerShift };
    } else {
      next.push({ rankCode, clientRatePerShift });
    }
    onRankClientRatesChange(next);
  };

  const shiftCoverageText = shiftCoverageLabel(input.shiftCoverage, ui);

  const emailBody = [
    `Service: ${serviceLabel}`,
    `Location: ${locationLabel}`,
    ...rankSummaryLines,
    `${ui.shiftCoverage}: ${shiftCoverageText}`,
    customRequest.trim() ? `Requirements: ${customRequest.trim()}` : null,
    email ? `Contact email: ${email}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const quoteMailtoRecipients =
    quoteRecipientEmails.length > 0
      ? quoteRecipientEmails.join(',')
      : content.opsNotificationEmail || content.contactEmail;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="cv-checker" />

      <div className="p-6 md:p-8">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-700 text-white shadow-md shadow-red-900/20">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              {ui.indicativeEstimate}
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
              {ui.estimateDisclaimer}
            </p>
          </div>
        </div>

        {editing && onRankClientRatesChange ? (
          <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
              Client rates per shift (by guard rank)
            </p>
            <p className="mt-1 text-xs text-amber-900/70">
              Ranks are synced from MD Settings → Rank Pay Matrix. Set the client billing rate per
              shift for each rank.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {guardRanks.map((rank) => (
                <label key={rank.rankCode} className="flex items-center gap-2 text-sm">
                  <span className="w-10 shrink-0 font-bold text-slate-800">{rank.rankCode}</span>
                  <span className="hidden min-w-0 flex-1 truncate text-xs text-slate-500 sm:inline">
                    {rank.fullTitle}
                  </span>
                  <span className="text-slate-400">Rs.</span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={clientRateFor(rank.rankCode)}
                    onChange={(e) =>
                      patchClientRate(rank.rankCode, parseInt(e.target.value, 10) || 0)
                    }
                    className="w-24 rounded border border-amber-300/80 bg-white px-2 py-1 text-slate-900"
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-5 lg:items-stretch">
          <div className="space-y-8 lg:col-span-3">
            <section className="space-y-4">
              <SectionHeading>{ui.serviceType}</SectionHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className={labelClass}>{ui.serviceType}</span>
                  <select
                    value={input.serviceType}
                    onChange={(e) =>
                      setInput((prev) => ({
                        ...prev,
                        serviceType: e.target.value as ServiceType,
                      }))
                    }
                    className={fieldClass}
                  >
                    {SECURITY_SERVICE_SLUGS.map((slug) => {
                      const type = SERVICE_SLUG_TO_TYPE[slug];
                      return (
                        <option key={slug} value={type}>
                          {serviceTypeLabels[type]}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className={labelClass}>{ui.location}</span>
                  <select
                    value={input.locationTier}
                    onChange={(e) =>
                      setInput((prev) => ({
                        ...prev,
                        locationTier: e.target.value as LocationTier,
                      }))
                    }
                    className={fieldClass}
                  >
                    <option value="colombo">{ui.colombo}</option>
                    <option value="greaterColombo">{ui.greaterColombo}</option>
                    <option value="other">{ui.otherDistrict}</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeading>{ui.guardRanksPerShift}</SectionHeading>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="hidden grid-cols-[4rem_1fr_4rem] gap-3 bg-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:grid">
                  <span>Rank</span>
                  <span>Role</span>
                  <span className="text-right">Qty</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {guardRanks.map((rank) => {
                    const qty = input.rankQuantities[rank.rankCode] ?? 0;
                    return (
                      <div
                        key={rank.rankCode}
                        className="grid grid-cols-[4rem_1fr_4rem] items-center gap-3 px-4 py-3 even:bg-slate-50/60"
                      >
                        <span className="text-sm font-bold text-red-800">{rank.rankCode}</span>
                        <span className="min-w-0 text-xs leading-snug text-slate-600 sm:text-sm">
                          {rank.fullTitle}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={qty}
                          onChange={(e) =>
                            setRankQty(rank.rankCode, parseInt(e.target.value, 10) || 0)
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm font-semibold text-slate-900 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                          aria-label={`${rank.fullTitle} quantity`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeading>{ui.shiftCoverage}</SectionHeading>
              <label className="block space-y-1.5">
                <span className={labelClass}>{ui.shiftCoverage}</span>
                <select
                  value={input.shiftCoverage}
                  onChange={(e) =>
                    setInput((prev) => ({
                      ...prev,
                      shiftCoverage: e.target.value as ShiftCoverage,
                    }))
                  }
                  className={fieldClass}
                >
                  <option value="day">{ui.shiftDayOnly}</option>
                  <option value="night">{ui.shiftNightOnly}</option>
                  <option value="both">{ui.shiftBoth}</option>
                </select>
              </label>
            </section>
          </div>

          <div className="flex lg:col-span-2">
            <div className="cv-estimate-panel flex w-full flex-col gap-6 rounded-2xl p-6 md:p-7 lg:min-h-full">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white">
                  {ui.monthlyEstimate}
                </p>
                <p className="mt-3 text-base font-bold leading-relaxed text-white md:text-lg">
                  {ui.quoteRequestSummary}
                </p>
              </div>

              <div className="flex flex-1 flex-col gap-6">
                <div className="flex-1 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
                  <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                    <span className="font-bold text-white/80">{ui.serviceType}</span>
                    <span className="text-right font-bold text-white">{serviceLabel}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                    <span className="font-bold text-white/80">{ui.location}</span>
                    <span className="text-right font-bold text-white">{locationLabel}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                    <span className="font-bold text-white/80">{ui.shiftCoverage}</span>
                    <span className="text-right font-bold text-white">{shiftCoverageText}</span>
                  </div>
                  <div className="space-y-2 pt-1">
                    <span className="font-bold text-white/80">{ui.guardRanksPerShift}</span>
                    {activeRanks.length > 0 ? (
                      <ul className="space-y-1.5">
                        {activeRanks.map((rank) => (
                          <li
                            key={rank.rankCode}
                            className="flex items-start justify-between gap-3 text-sm"
                          >
                            <span className="min-w-0 font-bold leading-snug text-white">
                              <span className="font-bold text-yellow-300">{rank.rankCode}</span>
                              <span className="ml-1.5 text-xs font-bold text-white/80">
                                {rank.fullTitle}
                              </span>
                            </span>
                            <span className="shrink-0 font-bold tabular-nums text-white">
                              {rank.qty}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm font-bold text-white">
                        {ui.totalGuardsPerShift}: {guardsForQuote}
                      </p>
                    )}
                  </div>
                </div>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-white">
                    {ui.customRequest}
                  </span>
                  <textarea
                    value={customRequest}
                    onChange={(e) => setCustomRequest(e.target.value)}
                    rows={5}
                    placeholder={ui.additionalNotes}
                    className="w-full flex-1 resize-none rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-yellow-400/60 focus:bg-white/15 focus:ring-2 focus:ring-yellow-400/20"
                  />
                </label>

                {showEmailCapture ? (
                  <form
                    className="mt-auto rounded-xl bg-white p-5 shadow-xl ring-2 ring-yellow-400/70"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!email) return;
                      window.location.href = `mailto:${quoteMailtoRecipients}?subject=${encodeURIComponent('Custom security quote request')}&body=${encodeURIComponent(emailBody)}`;
                    }}
                  >
                    <div className="flex items-center gap-2 text-red-800">
                      <Mail className="h-5 w-5 shrink-0" />
                      <p className="text-sm font-bold">{ui.emailEstimate}</p>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {ui.requestAssessment}
                    </p>
                    <div className="mt-4 space-y-3">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.lk"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-red-400 focus:bg-white focus:ring-2 focus:ring-red-100"
                        required
                      />
                      <button
                        type="submit"
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-yellow-400 py-3 text-sm font-bold text-red-950 transition hover:bg-yellow-300"
                      >
                        <Send className="h-4 w-4" />
                        Send
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
