'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import type { SuperappListingConsent } from '../../../lib/superapp-listing-consent';
import { fetchSuperappConsentSettings, saveSuperappConsentSettings } from './actions';

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Not opted in';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SuperappConsentSettingsPage() {
  const [consent, setConsent] = useState<SuperappListingConsent | null>(null);
  const [optIn, setOptIn] = useState(false);
  const [listProducts, setListProducts] = useState(true);
  const [listBooking, setListBooking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const result = await fetchSuperappConsentSettings();
    if (result.success) {
      setConsent(result.consent);
      const active = Boolean(result.consent?.consentedAt);
      setOptIn(active);
      setListProducts(result.consent?.listProducts ?? true);
      setListBooking(result.consent?.listBooking ?? false);
      setLoadError(null);
    } else {
      setLoadError(result.error ?? 'Failed to load settings');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = () => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await saveSuperappConsentSettings({
        optIn,
        listProducts,
        listBooking,
      });
      if (!result.success) {
        setActionMessage(result.error ?? 'Save failed');
        return;
      }
      setConsent(result.consent);
      setActionMessage(
        optIn
          ? 'Pears marketplace consent saved. Inventory exports are enabled per your selections.'
          : 'Pears marketplace consent withdrawn.',
      );
    });
  };

  if (isLoading) {
    return <p className="text-slate-500 animate-pulse text-sm">Loading Pears marketplace settings…</p>;
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {loadError}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-black text-slate-900 tracking-tight">Pears marketplace</h1>
        <p className="mt-2 text-sm text-slate-600 max-w-2xl">
          Opt in to list your tenant on the future Pears super-app. Pearzen reads published store
          profiles and inventory through read-only export APIs — your ERP stays the source of truth.
        </p>
      </div>

      {actionMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {actionMessage}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
              Listing consent
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Last updated {formatTimestamp(consent?.updatedAt)}
              {consent?.consentedByEmail ? ` · ${consent.consentedByEmail}` : ''}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
              consent?.consentedAt
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            {consent?.consentedAt ? 'Opted in' : 'Not listed'}
          </span>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={optIn}
            onChange={(event) => setOptIn(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">
              Allow Pears to list this business
            </span>
            <span className="mt-1 block text-xs text-slate-600">
              Enables read-only export of your store profile and eligible catalog data to the Pears
              marketplace boundary.
            </span>
          </span>
        </label>

        <div className={`space-y-3 ${optIn ? '' : 'opacity-50 pointer-events-none'}`}>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={listProducts}
              onChange={(event) => setListProducts(event.target.checked)}
              disabled={!optIn}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">List products</span>
              <span className="mt-0.5 block text-xs text-slate-600">
                Café menu (POS-synced), retail published SKUs, and salon retail products.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={listBooking}
              onChange={(event) => setListBooking(event.target.checked)}
              disabled={!optIn}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">List booking</span>
              <span className="mt-0.5 block text-xs text-slate-600">
                Salon appointments and bookable services when the booking export ships.
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={handleSave}
            className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save consent'}
          </button>
          <Link
            href="/settings/public-website"
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
          >
            Public website →
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-violet-100 bg-violet-50/60 p-5 text-sm text-slate-700 space-y-2">
        <p className="font-semibold text-violet-900">What stays private</p>
        <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
          <li>Internal ERP portals (HQ, OM, HR, payroll) are never exported.</li>
          <li>Inventory exports require product listing consent and published/active catalog rows.</li>
          <li>You can withdraw consent at any time — exports stop on the next Pears sync.</li>
        </ul>
      </section>
    </div>
  );
}
