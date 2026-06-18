import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, CheckCircle2, Navigation, Clock } from 'lucide-react';
import { fetchSmAssignedSiteRows } from '../../../lib/sm-portal-db';

export const dynamic = 'force-dynamic';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pickCoord(row: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = Number(row[k]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

type SiteRow = {
  site_name: string;
  distanceKm: number | null;
  visitedToday: boolean;
  lastVisitDate: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
};

function googleMapsDirectionsUrl(site: SiteRow): string | null {
  if (site.lat !== null && site.lng !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${site.lat},${site.lng}`;
  }
  if (site.address?.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site.address.trim())}`;
  }
  return null;
}

export default async function SitesToVisitPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');
  const epf = session.user.email?.split('@')[0].toUpperCase() ?? '';

  const today = new Date().toISOString().split('T')[0];

  const assignedRaw = await fetchSmAssignedSiteRows(epf);

  // Fetch today's visit logs for this SM
  const { data: visitedTodayRaw } = await supabase
    .from('sm_visit_logs')
    .select('site_name, created_at')
    .eq('sm_epf', epf)
    .eq('visit_type', 'VISIT')
    .gte('created_at', `${today}T00:00:00`);

  const visitedTodaySet = new Set(
    (visitedTodayRaw ?? []).map((v: { site_name: string }) => v.site_name),
  );

  // Fetch last visit to determine reference point for distance sorting
  const { data: lastVisitRaw } = await supabase
    .from('sm_visit_logs')
    .select('latitude, longitude, created_at, site_name')
    .eq('sm_epf', epf)
    .eq('visit_type', 'VISIT')
    .order('created_at', { ascending: false })
    .limit(1);

  // Fetch all past visit dates per site for "last visited" display
  const { data: allVisitsRaw } = await supabase
    .from('sm_visit_logs')
    .select('site_name, created_at')
    .eq('sm_epf', epf)
    .eq('visit_type', 'VISIT')
    .order('created_at', { ascending: false });

  const lastVisitBySite = new Map<string, string>();
  for (const v of allVisitsRaw ?? []) {
    const row = v as { site_name: string; created_at: string };
    if (!lastVisitBySite.has(row.site_name)) {
      lastVisitBySite.set(row.site_name, row.created_at.split('T')[0]);
    }
  }

  const lastVisit = lastVisitRaw?.[0] as
    | { latitude: number | null; longitude: number | null; created_at: string; site_name: string }
    | undefined;

  const refLat = lastVisit?.latitude ?? null;
  const refLng = lastVisit?.longitude ?? null;

  // Build site rows with distance
  const sites: SiteRow[] = (assignedRaw ?? []).map((rawSite: Record<string, unknown>) => {
    const name = String(rawSite['site_name'] ?? '');
    const siteLat = pickCoord(rawSite, ['lat', 'latitude', 'site_lat', 'site_latitude']);
    const siteLng = pickCoord(rawSite, ['lng', 'longitude', 'site_lng', 'site_longitude']);

    let distanceKm: number | null = null;
    if (refLat !== null && refLng !== null && siteLat !== null && siteLng !== null) {
      distanceKm = haversineKm(refLat, refLng, siteLat, siteLng);
    }

    return {
      site_name: name,
      distanceKm,
      visitedToday: visitedTodaySet.has(name),
      lastVisitDate: lastVisitBySite.get(name) ?? null,
      lat: siteLat,
      lng: siteLng,
      address: rawSite['address'] != null ? String(rawSite['address']) : null,
    };
  });

  // Sort: unvisited first, then by distance (closest first); visited go to bottom
  sites.sort((a, b) => {
    if (a.visitedToday !== b.visitedToday) return a.visitedToday ? 1 : -1;
    if (a.distanceKm === null && b.distanceKm === null) return a.site_name.localeCompare(b.site_name);
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  const remaining = sites.filter(s => !s.visitedToday);
  const done = sites.filter(s => s.visitedToday);

  return (
    <div className="flex-1 flex flex-col p-5 space-y-5 min-h-[100dvh]">
      {/* Header */}
      <header className="flex items-center gap-3 pt-2">
        <Link
          href="/dashboard"
          className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Sites to Visit</h1>
          <p className="text-sm text-slate-500 font-mono">
            {remaining.length} remaining · sorted by distance
          </p>
        </div>
        <div className="ml-auto p-3 bg-sky-500/10 rounded-xl border border-sky-500/20">
          <Navigation className="w-5 h-5 text-sky-600" />
        </div>
      </header>

      {/* Reference point note */}
      {lastVisit && (
        <div className="flex items-center gap-2 px-1">
          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
          <p className="text-sm text-slate-400 font-mono">
            Distances from last visit · {lastVisit.site_name} · {lastVisit.created_at.split('T')[0]}
          </p>
        </div>
      )}

      {sites.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-12">
          <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
            <MapPin className="w-7 h-7 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-600 uppercase tracking-tight">No Sites Assigned</p>
            <p className="text-sm text-slate-400 mt-1">Contact your manager to get sites assigned.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Remaining */}
          {remaining.length > 0 && (
            <section className="space-y-2">
              <p className="text-sm font-black text-slate-500 uppercase tracking-[0.2em] px-1">
                Pending · {remaining.length}
              </p>
              <div className="space-y-2">
                {remaining.map((site, i) => (
                  <SiteCard
                    key={site.site_name}
                    site={site}
                    rank={i + 1}
                    visited={false}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Visited today */}
          {done.length > 0 && (
            <section className="space-y-2">
              <p className="text-sm font-black text-slate-500 uppercase tracking-[0.2em] px-1">
                Visited Today · {done.length}
              </p>
              <div className="space-y-2">
                {done.map((site) => (
                  <SiteCard
                    key={site.site_name}
                    site={site}
                    rank={null}
                    visited={true}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SiteCard({
  site,
  rank,
  visited,
}: {
  site: SiteRow;
  rank: number | null;
  visited: boolean;
}) {
  const distLabel =
    site.distanceKm === null
      ? null
      : site.distanceKm < 1
      ? `${Math.round(site.distanceKm * 1000)} m`
      : `${site.distanceKm.toFixed(1)} km`;

  const mapsUrl = googleMapsDirectionsUrl(site);
  const badgeClassName = `w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
    visited
      ? 'bg-emerald-500/10 border border-emerald-500/20'
      : 'bg-sky-500/15 border border-sky-500/30'
  }`;
  const badgeIcon = visited ? (
    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
  ) : (
    <Navigation className="w-4 h-4 text-sky-600" />
  );

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
        visited
          ? 'bg-slate-100/30 border-slate-200/30'
          : rank === 1
          ? 'bg-sky-500/5 border-sky-500/30'
          : 'bg-white/90 border-slate-200/60'
      }`}
    >
      {/* Rank / Visited badge — tap to open directions in Google Maps */}
      {mapsUrl ? (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Get directions to ${site.site_name}`}
          title={`Directions to ${site.site_name}`}
          className={`${badgeClassName} hover:opacity-80 active:scale-95 transition-all`}
        >
          {badgeIcon}
        </a>
      ) : (
        <div className={badgeClassName} title="No location on file">
          {badgeIcon}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-base font-black uppercase tracking-tight leading-tight truncate ${
            visited ? 'text-slate-500' : 'text-slate-900'
          }`}
        >
          {site.site_name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {site.lastVisitDate && (
            <span className="flex items-center gap-1 text-sm text-slate-400 font-mono">
              <Clock className="w-2.5 h-2.5" />
              {visited ? 'Today' : `Last: ${site.lastVisitDate}`}
            </span>
          )}
          {!site.lastVisitDate && !visited && (
            <span className="text-sm text-slate-400 font-mono">Never visited</span>
          )}
        </div>
      </div>

      {/* Distance */}
      {distLabel && !visited && (
        <div className="shrink-0 text-right">
          <p
            className={`text-sm font-black tabular-nums ${
              rank === 1 ? 'text-sky-600' : 'text-slate-500'
            }`}
          >
            {distLabel}
          </p>
          <p className="text-sm text-slate-400 uppercase tracking-wider">away</p>
        </div>
      )}

      {/* Log Visit CTA for unvisited */}
      {!visited && (
        <Link
          href={`/visit`}
          className="shrink-0 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 text-sm font-black uppercase tracking-wide hover:bg-amber-500/20 transition-all active:scale-95"
        >
          Log
        </Link>
      )}
    </div>
  );
}
