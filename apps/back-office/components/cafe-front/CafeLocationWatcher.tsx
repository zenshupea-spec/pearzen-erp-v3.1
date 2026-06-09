'use client';

import { Loader2, MapPin, Navigation, ShieldCheck } from 'lucide-react';

import { useCafeGeolocation } from './CafeGeolocationContext';

function permissionHint(permission: string): string | null {
  if (permission === 'denied') {
    return 'Location is blocked for this browser. Allow it in phone settings, then tap Enable location again.';
  }
  if (permission === 'prompt' || permission === 'unknown') {
    return 'Your phone will ask to share location — tap Allow. We keep GPS on while you stay on this page.';
  }
  return null;
}

export function CafeLocationWatcher({ siteName }: { siteName?: string | null }) {
  const {
    supported,
    permission,
    watching,
    requesting,
    coords,
    distanceM,
    inBounds,
    error,
    enableLocation,
    geofenceRadiusM,
  } = useCafeGeolocation();

  const hint = permissionHint(permission);

  let statusLabel = 'Location off';
  let statusTone = 'text-slate-600';
  let badgeClass = 'border-slate-200 bg-slate-50 text-slate-600';

  if (!supported) {
    statusLabel = 'GPS unavailable';
    statusTone = 'text-rose-700';
    badgeClass = 'border-rose-200 bg-rose-50 text-rose-800';
  } else if (permission === 'denied') {
    statusLabel = 'Permission blocked';
    statusTone = 'text-rose-700';
    badgeClass = 'border-rose-200 bg-rose-50 text-rose-800';
  } else if (requesting && !coords) {
    statusLabel = 'Waiting for GPS fix…';
    statusTone = 'text-amber-800';
    badgeClass = 'border-amber-200 bg-amber-50 text-amber-900';
  } else if (watching && coords && inBounds === true) {
    statusLabel = 'On site — ready to verify';
    statusTone = 'text-emerald-800';
    badgeClass = 'border-emerald-200 bg-emerald-50 text-emerald-900';
  } else if (watching && coords && inBounds === false) {
    statusLabel = `${Math.round(distanceM ?? 0)}m from café`;
    statusTone = 'text-amber-800';
    badgeClass = 'border-amber-200 bg-amber-50 text-amber-900';
  } else if (watching) {
    statusLabel = 'GPS active';
    statusTone = 'text-sky-800';
    badgeClass = 'border-sky-200 bg-sky-50 text-sky-900';
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/90 shadow-sm backdrop-blur-sm">
      <div className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50">
          {inBounds ? (
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          ) : (
            <MapPin className="h-4 w-4 text-sky-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-800">
            Live location
          </p>
          <p className={`mt-0.5 text-xs font-semibold ${statusTone}`}>{statusLabel}</p>
          {siteName ? (
            <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {siteName}
            </p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${badgeClass}`}
        >
          {watching ? 'On' : 'Off'}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {hint && supported && permission !== 'granted' ? (
          <p className="text-xs font-medium leading-relaxed text-slate-600">{hint}</p>
        ) : watching ? (
          <p className="text-xs font-medium leading-relaxed text-slate-600">
            GPS stays active while this page is open so check-in feels instant. Move within{' '}
            {geofenceRadiusM}m of the café when you are ready.
          </p>
        ) : (
          <p className="text-xs font-medium leading-relaxed text-slate-600">
            Tap Enable location — your iPhone or Android will ask once. Choose Allow so we can
            confirm you are at the café.
          </p>
        )}

        {coords ? (
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
              ±{Math.round(coords.accuracyM)}m accuracy
            </span>
            {distanceM != null ? (
              <span
                className={`rounded-full border px-2 py-1 ${
                  inBounds
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                {Math.round(distanceM)}m · max {geofenceRadiusM}m
              </span>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            {error}
          </p>
        ) : null}

        {!watching || permission === 'denied' || !supported ? (
          <button
            type="button"
            onClick={enableLocation}
            disabled={!supported || requesting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3.5 text-sm font-black uppercase tracking-[0.15em] text-white shadow-md shadow-sky-600/20 transition-all hover:bg-sky-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {requesting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for GPS…
              </>
            ) : (
              <>
                <Navigation className="h-4 w-4" />
                Enable location
              </>
            )}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs font-bold uppercase tracking-wider text-emerald-800">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Location active on this page
          </div>
        )}
      </div>
    </section>
  );
}
