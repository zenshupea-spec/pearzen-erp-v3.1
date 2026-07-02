'use client';

import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, ClipboardList, Mail, Minus, Plus, Send, Users } from 'lucide-react';

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

function RankQtyStepper({
  qty,
  onChange,
  label,
}: {
  qty: number;
  onChange: (qty: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={qty <= 0}
        aria-label={`Decrease ${label}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition enabled:hover:border-red-200 enabled:hover:bg-red-50 enabled:hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-sm font-bold tabular-nums text-slate-900" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={qty >= 50}
        aria-label={`Increase ${label}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-800 transition enabled:hover:border-red-300 enabled:hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
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
  const [mobileStep, setMobileStep] = useState<'configure' | 'request'>('configure');
  const [guardRanksExpanded, setGuardRanksExpanded] = useState(false);

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

  const rankSummaryShort =
    activeRanks.length > 0
      ? activeRanks.map((rank) => `${rank.rankCode} ×${rank.qty}`).join(', ')
      : `${guardsForQuote} selected`;

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

      <div className="p-6 md:p-8 max-md:p-4">
        <div className="mb-8 flex items-start gap-4 max-md:mb-4 max-md:gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-700 text-white shadow-md shadow-red-900/20 max-md:h-10 max-md:w-10 max-md:rounded-xl">
            <ClipboardList className="h-6 w-6 max-md:h-5 max-md:w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 max-md:text-lg">
              {ui.indicativeEstimate}
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500 max-md:line-clamp-2 max-md:text-xs">
              {ui.estimateDisclaimer}
            </p>
          </div>
        </div>

        <div
          className="mb-6 grid grid-cols-2 gap-2 md:hidden"
          role="tablist"
          aria-label="Quote form steps"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileStep === 'configure'}
            onClick={() => setMobileStep('configure')}
            className={`rounded-full px-3 py-2 text-xs font-bold transition ${
              mobileStep === 'configure'
                ? 'bg-red-700 text-white'
                : 'border border-slate-200 bg-white text-slate-600'
            }`}
          >
            1. Details
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileStep === 'request'}
            onClick={() => setMobileStep('request')}
            className={`rounded-full px-3 py-2 text-xs font-bold transition ${
              mobileStep === 'request'
                ? 'bg-red-700 text-white'
                : 'border border-slate-200 bg-white text-slate-600'
            }`}
          >
            2. Send quote
          </button>
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

        <div className="grid gap-8 lg:grid-cols-5 lg:items-stretch max-md:gap-0">
          <div
            className={`space-y-8 lg:col-span-3 max-md:space-y-4 ${
              mobileStep === 'request' ? 'max-md:hidden' : ''
            }`}
          >
            <section className="space-y-4 max-md:space-y-3">
              <SectionHeading>{ui.serviceType}</SectionHeading>
              <div className="grid gap-4 sm:grid-cols-2 max-md:gap-3">
                <label className="block space-y-1.5">
                  <span className={`${labelClass} max-md:sr-only`}>{ui.serviceType}</span>
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
                  <span className={`${labelClass} max-md:sr-only`}>{ui.location}</span>
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

            <section className="space-y-4 max-md:space-y-2">
              <div className="max-md:hidden">
                <SectionHeading>{ui.guardRanksPerShift}</SectionHeading>
              </div>
              <button
                type="button"
                onClick={() => setGuardRanksExpanded((open) => !open)}
                className={`flex w-full flex-col gap-2.5 rounded-xl border px-3.5 py-3 text-left transition md:hidden ${
                  guardRanksExpanded
                    ? 'border-red-300 bg-red-50/40 shadow-sm ring-2 ring-red-100'
                    : 'border-slate-200 bg-white shadow-sm hover:border-red-200 hover:bg-red-50/30'
                }`}
                aria-expanded={guardRanksExpanded}
              >
                <div className="flex items-start gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-800">
                    <Users className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-800">
                      {ui.guardRanksPerShift}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-slate-500">{ui.guardRanksMobileHint}</p>
                  </div>
                  {guardRanksExpanded ? (
                    <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden />
                  ) : (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  )}
                </div>

                {activeRanks.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pl-11">
                    {activeRanks.map((rank) => (
                      <span
                        key={rank.rankCode}
                        className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-bold text-red-900"
                      >
                        <span>{rank.rankCode}</span>
                        <span className="rounded-full bg-red-700 px-1.5 py-0.5 text-[10px] font-black text-white">
                          ×{rank.qty}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="pl-11 text-xs font-medium text-slate-500">{ui.guardRanksMobileEmpty}</p>
                )}

                <div className="flex items-center justify-between gap-2 border-t border-slate-200/80 pt-2 pl-11">
                  <p className="text-xs text-slate-600">
                    <span className="font-bold text-slate-800">{ui.totalGuardsPerShift}:</span>{' '}
                    <span className="font-bold tabular-nums text-red-800">{guardsForQuote}</span>
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-red-800">
                    {ui.guardRanksMobileTapToEdit}
                    <Plus className="h-3 w-3" aria-hidden />
                  </span>
                </div>
              </button>
              <div
                className={`overflow-hidden rounded-xl border border-slate-200 ${
                  guardRanksExpanded ? 'max-md:block' : 'max-md:hidden'
                } md:block`}
              >
                <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-snug text-slate-600 md:hidden">
                  {ui.guardRanksMobileHint}
                </p>
                <div className="hidden grid-cols-[4rem_1fr_4rem] gap-3 bg-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:grid">
                  <span>Rank</span>
                  <span>Role</span>
                  <span className="text-right">Qty</span>
                </div>
                <div className="max-h-none divide-y divide-slate-100 max-md:max-h-56 max-md:overflow-y-auto">
                  {guardRanks.map((rank) => {
                    const qty = input.rankQuantities[rank.rankCode] ?? 0;
                    return (
                      <div
                        key={rank.rankCode}
                        className={`grid items-center gap-2 px-3 py-3 md:grid-cols-[4rem_1fr_4rem] md:gap-3 md:px-4 max-md:py-2.5 ${
                          qty > 0 ? 'bg-red-50/40' : 'even:bg-slate-50/60'
                        }`}
                      >
                        <span
                          className={`text-sm font-bold ${qty > 0 ? 'text-red-800' : 'text-slate-500'}`}
                        >
                          {rank.rankCode}
                        </span>
                        <span className="min-w-0 text-xs leading-snug text-slate-600 max-md:line-clamp-2 sm:text-sm">
                          {rank.fullTitle}
                        </span>
                        <div className="max-md:col-span-3 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 md:hidden">
                            {ui.guardsPerShift}
                          </span>
                          <div className="md:hidden">
                            <RankQtyStepper
                              qty={qty}
                              onChange={(next) => setRankQty(rank.rankCode, next)}
                              label={`${rank.fullTitle} quantity`}
                            />
                          </div>
                          <input
                            type="number"
                            min={0}
                            max={50}
                            value={qty}
                            onChange={(e) =>
                              setRankQty(rank.rankCode, parseInt(e.target.value, 10) || 0)
                            }
                            className="hidden w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm font-semibold text-slate-900 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 md:block"
                            aria-label={`${rank.fullTitle} quantity`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-4 max-md:space-y-3">
              <SectionHeading>{ui.shiftCoverage}</SectionHeading>
              <label className="block space-y-1.5">
                <span className={`${labelClass} max-md:sr-only`}>{ui.shiftCoverage}</span>
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

            <div className="md:hidden">
              <button
                type="button"
                onClick={() => setMobileStep('request')}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-red-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-800"
              >
                Continue to send quote
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            className={`flex lg:col-span-2 ${
              mobileStep === 'configure' ? 'max-md:hidden' : ''
            }`}
          >
            <div className="cv-estimate-panel flex w-full flex-col gap-6 rounded-2xl p-6 md:p-7 lg:min-h-full max-md:gap-4 max-md:p-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white">
                  {ui.monthlyEstimate}
                </p>
                <p className="mt-3 text-base font-bold leading-relaxed text-white md:text-lg max-md:mt-2 max-md:text-sm">
                  {ui.quoteRequestSummary}
                </p>
              </div>

              <div className="flex flex-1 flex-col gap-6 max-md:gap-4">
                <div className="flex-1 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm max-md:hidden">
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

                <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm md:hidden">
                  <div className="flex justify-between gap-3">
                    <span className="font-bold text-white/80">{ui.serviceType}</span>
                    <span className="text-right text-xs font-bold text-white">{serviceLabel}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="font-bold text-white/80">{ui.location}</span>
                    <span className="text-right text-xs font-bold text-white">{locationLabel}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="font-bold text-white/80">{ui.shiftCoverage}</span>
                    <span className="text-right text-xs font-bold text-white">{shiftCoverageText}</span>
                  </div>
                  <p className="text-xs font-bold text-white/90">{rankSummaryShort}</p>
                </div>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-white">
                    {ui.customRequest}
                  </span>
                  <textarea
                    value={customRequest}
                    onChange={(e) => setCustomRequest(e.target.value)}
                    rows={3}
                    placeholder={ui.additionalNotes}
                    className="w-full flex-1 resize-none rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-yellow-400/60 focus:bg-white/15 focus:ring-2 focus:ring-yellow-400/20 md:py-3"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setMobileStep('configure')}
                  className="text-xs font-semibold text-white/70 underline underline-offset-2 md:hidden"
                >
                  ← Edit details
                </button>

                {showEmailCapture ? (
                  <form
                    className="mt-auto rounded-xl bg-white p-5 shadow-xl ring-2 ring-yellow-400/70 max-md:p-4"
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
                    <div className="mt-4 space-y-3 max-md:mt-3 max-md:space-y-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.lk"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-red-400 focus:bg-white focus:ring-2 focus:ring-red-100 max-md:py-2.5"
                        required
                      />
                      <button
                        type="submit"
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-yellow-400 py-3 text-sm font-bold text-red-950 transition hover:bg-yellow-300 max-md:py-2.5"
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
