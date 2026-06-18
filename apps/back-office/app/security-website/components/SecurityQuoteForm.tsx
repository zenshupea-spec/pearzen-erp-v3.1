'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';

import { submitSecurityWebsiteLead } from '../actions';
import { useSecurityWebsite } from './SecurityWebsiteContext';

type Props = {
  defaultService?: string;
  defaultGuards?: number;
  defaultEstimate?: number;
};

export default function SecurityQuoteForm({
  defaultService,
  defaultGuards,
  defaultEstimate,
}: Props) {
  const { ui } = useSecurityWebsite();
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    clientCompany: '',
    siteDistrict: '',
    serviceType: defaultService ?? 'static',
    guardsNeeded: defaultGuards ?? 2,
    shiftPattern: '12h',
    preferredStart: '',
    notes: '',
    estimatedMonthlyLkr: defaultEstimate,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitSecurityWebsiteLead({
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail || undefined,
        clientCompany: form.clientCompany || undefined,
        siteDistrict: form.siteDistrict || undefined,
        serviceType: form.serviceType,
        guardsNeeded: form.guardsNeeded,
        shiftPattern: form.shiftPattern,
        preferredStart: form.preferredStart || undefined,
        estimatedMonthlyLkr: form.estimatedMonthlyLkr,
        notes: form.notes || undefined,
        source: 'quote_form',
      });
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error ?? 'Submission failed');
      }
    });
  };

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-lg font-semibold text-emerald-900">{ui.quoteSuccess}</p>
      </div>
    );
  }

  const fieldClass =
    'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
            {ui.yourName} *
          </span>
          <input
            required
            value={form.contactName}
            onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
            className={fieldClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Phone *
          </span>
          <input
            required
            type="tel"
            value={form.contactPhone}
            onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
            className={fieldClass}
            placeholder="+94 7X XXX XXXX"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Email
          </span>
          <input
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
            className={fieldClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
            {ui.companyName}
          </span>
          <input
            value={form.clientCompany}
            onChange={(e) => setForm((f) => ({ ...f, clientCompany: e.target.value }))}
            className={fieldClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
            {ui.siteDistrict}
          </span>
          <input
            value={form.siteDistrict}
            onChange={(e) => setForm((f) => ({ ...f, siteDistrict: e.target.value }))}
            className={fieldClass}
            placeholder="e.g. Colombo, Gampaha"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
            {ui.serviceType}
          </span>
          <select
            value={form.serviceType}
            onChange={(e) => setForm((f) => ({ ...f, serviceType: e.target.value }))}
            className={fieldClass}
          >
            <option value="static">{ui.static}</option>
            <option value="patrol">{ui.patrol}</option>
            <option value="corporate">{ui.corporate}</option>
            <option value="event">{ui.event}</option>
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
            {ui.guardsPerShift}
          </span>
          <input
            type="number"
            min={1}
            max={50}
            value={form.guardsNeeded}
            onChange={(e) =>
              setForm((f) => ({ ...f, guardsNeeded: parseInt(e.target.value, 10) || 1 }))
            }
            className={fieldClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
            {ui.hoursPerShift}
          </span>
          <select
            value={form.shiftPattern}
            onChange={(e) => setForm((f) => ({ ...f, shiftPattern: e.target.value }))}
            className={fieldClass}
          >
            <option value="8h">{ui.hours8}</option>
            <option value="12h">{ui.hours12}</option>
            <option value="24h">{ui.hours24}</option>
          </select>
        </label>
        <label className="block space-y-1.5 md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
            {ui.startDate}
          </span>
          <input
            type="date"
            value={form.preferredStart}
            onChange={(e) => setForm((f) => ({ ...f, preferredStart: e.target.value }))}
            className={fieldClass}
          />
        </label>
        <label className="block space-y-1.5 md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
            {ui.additionalNotes}
          </span>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className={`${fieldClass} resize-y`}
          />
        </label>
      </div>

      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60 md:w-auto md:px-8"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {ui.submitQuote}
      </button>
    </form>
  );
}
