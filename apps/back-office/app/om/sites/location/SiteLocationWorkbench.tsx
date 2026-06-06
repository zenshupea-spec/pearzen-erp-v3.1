'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Crosshair,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import {
  getSitesNeedingGpsCapture,
  getSitesWithGpsConfigured,
  updateSiteGpsCoordinates,
  type OmSiteRecord,
} from '../../actions/sites';
import { resolveGeofenceRadiusM } from '../../../../lib/site-geofence';
import { siteNeedsGpsCapture } from '../../lib/site-gps';

type ViewMode = 'pending' | 'all';

function formatCoords(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return '—';
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

type GeoReadResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; error: string };

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission denied. Allow location for this site in your browser settings, then try again.';
    case err.POSITION_UNAVAILABLE:
      return 'Location unavailable. Turn on Location Services on this device, then try again.';
    case err.TIMEOUT:
      return 'GPS timed out. Move to an open area or wait for a satellite fix, then try again.';
    default:
      return err.message || 'Could not read device location.';
  }
}

function readDeviceGeolocation(options: {
  highAccuracy: boolean;
  timeoutMs: number;
}): Promise<GeoReadResult> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve({ ok: false, error: 'GPS is only available in the browser.' });
      return;
    }
    if (!window.isSecureContext) {
      resolve({
        ok: false,
        error: 'Location requires HTTPS (or localhost). Open this page with a secure URL.',
      });
      return;
    }
    if (!navigator.geolocation) {
      resolve({
        ok: false,
        error: 'This browser does not support GPS. Enter coordinates manually.',
      });
      return;
    }

    let settled = false;
    const finish = (result: GeoReadResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      resolve(result);
    };

    const watchdog = window.setTimeout(() => {
      finish({
        ok: false,
        error: 'GPS request timed out. Try again near a window or enter coordinates manually.',
      });
    }, options.timeoutMs + 1500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        finish({
          ok: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        finish({ ok: false, error: geolocationErrorMessage(err) });
      },
      {
        enableHighAccuracy: options.highAccuracy,
        timeout: options.timeoutMs,
        maximumAge: options.highAccuracy ? 0 : 60_000,
      },
    );
  });
}

async function readDeviceGeolocationWithRetry(): Promise<GeoReadResult> {
  const accurate = await readDeviceGeolocation({ highAccuracy: true, timeoutMs: 15_000 });
  if (accurate.ok) return accurate;
  const retryable =
    accurate.error.includes('timed out') || accurate.error.includes('unavailable');
  if (!retryable) return accurate;
  return readDeviceGeolocation({ highAccuracy: false, timeoutMs: 25_000 });
}

function SiteLocationCard({
  site,
  onSaved,
  isDemo,
}: {
  site: OmSiteRecord;
  onSaved: () => void;
  isDemo?: boolean;
}) {
  const needsCapture = siteNeedsGpsCapture(site);
  const [lat, setLat] = useState(
    site.latitude != null && site.latitude !== 0 ? String(site.latitude) : '',
  );
  const [lng, setLng] = useState(
    site.longitude != null && site.longitude !== 0 ? String(site.longitude) : '',
  );
  const geofenceRadiusM = resolveGeofenceRadiusM(site.geofence_radius);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const persistCoordinates = useCallback(
    async (latitude: number, longitude: number): Promise<boolean> => {
      if (isDemo) {
        setInfo(
          'Device GPS applied to the form. Preview mode — save is disabled until live sites exist in Supabase.',
        );
        return false;
      }
      setSaving(true);
      const result = await updateSiteGpsCoordinates({
        siteId: site.id,
        latitude,
        longitude,
      });
      setSaving(false);
      if (!result.success) {
        setError(result.error);
        return false;
      }
      setSuccess(true);
      onSaved();
      return true;
    },
    [isDemo, onSaved, site.id],
  );

  const markGpsFromDevice = useCallback(async () => {
    setError(null);
    setInfo(null);
    setSuccess(false);
    setCapturing(true);
    const geo = await readDeviceGeolocationWithRetry();
    setCapturing(false);
    if (!geo.ok) {
      setError(geo.error);
      return;
    }

    setLat(geo.latitude.toFixed(6));
    setLng(geo.longitude.toFixed(6));

    if (isDemo) {
      setInfo(
        'Device GPS applied to the form. Preview mode — save is disabled until live sites exist in Supabase.',
      );
      return;
    }

    setInfo('Saving device GPS to this site…');
    await persistCoordinates(geo.latitude, geo.longitude);
    setInfo(null);
  }, [isDemo, persistCoordinates]);

  const handleSave = async () => {
    setError(null);
    setInfo(null);
    setSuccess(false);
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError('Enter valid latitude and longitude.');
      return;
    }
    await persistCoordinates(latitude, longitude);
  };

  const previewLat = Number(lat);
  const previewLng = Number(lng);
  const mapsHref =
    Number.isFinite(previewLat) && Number.isFinite(previewLng)
      ? `https://maps.google.com/?q=${previewLat},${previewLng}`
      : null;

  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-sm ring-1 transition-all ${
        needsCapture
          ? 'border-amber-200/90 ring-amber-100'
          : 'border-slate-200/80 ring-slate-100'
      }`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900">{site.site_name}</h3>
          {site.address ? (
            <p className="mt-1 text-xs font-medium text-slate-500">{site.address}</p>
          ) : null}
          {site.assigned_sm_epf ? (
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-indigo-600">
              SM: {site.assigned_sm_epf}
            </p>
          ) : (
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
              No SM assigned yet
            </p>
          )}
        </div>
        {needsCapture ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-900">
            {site.needs_om_gps_capture ? 'MD requested capture' : 'GPS missing'}
          </span>
        ) : (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-800">
            Configured
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">
            Latitude
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="6.927079"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">
            Longitude
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="79.861244"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">
            Geofence radius (m)
          </label>
          <p className="font-mono text-sm font-black tabular-nums text-slate-900">
            {geofenceRadiusM} m
          </p>
          <p className="mt-1 text-[10px] font-medium text-slate-500">
            Set by MD at site registration. OM captures GPS coordinates only.
          </p>
        </div>
      </div>

      {site.location_captured_at && !needsCapture ? (
        <p className="mt-3 text-[10px] text-slate-500">
          Last set {new Date(site.location_captured_at).toLocaleString('en-GB')}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
          {error}
        </p>
      ) : null}

      {info ? (
        <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
          {info}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void markGpsFromDevice()}
          disabled={capturing || saving}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-md hover:bg-indigo-500 disabled:opacity-60"
        >
          {capturing || saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Crosshair className="h-4 w-4" />
          )}
          {capturing ? 'Acquiring GPS…' : saving ? 'Saving GPS…' : 'Mark GPS from this device'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-md hover:bg-emerald-500 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
          Save coordinates
        </button>
        {mapsHref ? (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-800 hover:bg-emerald-50"
          >
            <MapPin className="h-4 w-4" />
            Open in Maps
          </a>
        ) : null}
      </div>
      {!needsCapture && (
        <p className="mt-2 font-mono text-[10px] text-slate-500">
          Current: {formatCoords(site.latitude, site.longitude)}
        </p>
      )}
    </article>
  );
}

export default function SiteLocationWorkbench({
  initialPending,
  initialConfigured,
  isDemo = false,
}: {
  initialPending: OmSiteRecord[];
  initialConfigured: OmSiteRecord[];
  isDemo?: boolean;
}) {
  const [view, setView] = useState<ViewMode>('pending');
  const [pending, setPending] = useState(initialPending);
  const [configured, setConfigured] = useState(initialConfigured);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    const [p, c] = await Promise.all([getSitesNeedingGpsCapture(), getSitesWithGpsConfigured()]);
    setPending(p);
    setConfigured(c);
    setRefreshing(false);
  }, []);

  const list = view === 'pending' ? pending : [...pending, ...configured];

  const sortedList = useMemo(() => {
    return [...list].sort((a, b) => {
      const aNeed = siteNeedsGpsCapture(a) ? 0 : 1;
      const bNeed = siteNeedsGpsCapture(b) ? 0 : 1;
      if (aNeed !== bNeed) return aNeed - bNeed;
      return a.site_name.localeCompare(b.site_name);
    });
  }, [list]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 shadow-inner">
          <button
            type="button"
            onClick={() => setView('pending')}
            className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
              view === 'pending'
                ? 'bg-white text-amber-800 shadow-sm ring-1 ring-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Needs GPS ({pending.length})
          </button>
          <button
            type="button"
            onClick={() => setView('all')}
            className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
              view === 'all'
                ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All sites ({pending.length + configured.length})
          </button>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <p className="text-sm text-slate-600">
        When MD registers a site without coordinates (or checks &quot;Request OM Field GPS
        Capture&quot;), it appears here. Set GPS manually, or use{' '}
        <strong className="text-slate-800">Mark GPS from this device</strong> on site to capture
        and save in one step (allow location when prompted).
      </p>

      {sortedList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
          <MapPin className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-600">
            {view === 'pending'
              ? 'No sites waiting for GPS capture.'
              : 'No sites in the directory yet.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sortedList.map((site) => (
            <SiteLocationCard key={site.id} site={site} onSaved={reload} isDemo={isDemo} />
          ))}
        </div>
      )}
    </div>
  );
}
