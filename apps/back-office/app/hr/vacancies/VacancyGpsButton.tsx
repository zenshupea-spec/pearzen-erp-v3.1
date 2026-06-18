'use client';

import { MapPin, Navigation } from 'lucide-react';

import {
  buildGoogleMapsExternalUrl,
  formatGpsCoords,
} from '../../../lib/site-geofence';

type VacancyGpsButtonProps = {
  lat: number | null;
  lng: number | null;
  address: string;
  siteName: string;
  needsOmGpsCapture?: boolean;
};

function resolveMapsUrl({ lat, lng, address, siteName }: VacancyGpsButtonProps): string | null {
  if (lat != null && lng != null) {
    return buildGoogleMapsExternalUrl(lat, lng);
  }
  const query = address.trim() || siteName.trim();
  if (!query || query === 'Address not on file') return null;
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

function openMapsPopup(url: string) {
  window.open(url, 'vacancy-site-map', 'noopener,noreferrer,width=960,height=720');
}

export default function VacancyGpsButton(props: VacancyGpsButtonProps) {
  const mapsUrl = resolveMapsUrl(props);
  const hasCoords = props.lat != null && props.lng != null;
  const coordsLabel = hasCoords ? formatGpsCoords(props.lat!, props.lng!) : null;

  if (!mapsUrl) {
    return (
      <button
        type="button"
        disabled
        title={
          props.needsOmGpsCapture
            ? 'GPS pending OM field capture'
            : 'No GPS or address available for maps'
        }
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400"
      >
        <MapPin className="h-3.5 w-3.5" />
        GPS unavailable
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openMapsPopup(mapsUrl)}
      title={hasCoords ? `Open GPS in Google Maps (${coordsLabel})` : `Search address in Google Maps`}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-emerald-800 transition-all hover:border-emerald-300 hover:bg-emerald-100"
    >
      <Navigation className="h-3.5 w-3.5" />
      {hasCoords ? `Open GPS · ${coordsLabel}` : 'Open in Google Maps'}
    </button>
  );
}
