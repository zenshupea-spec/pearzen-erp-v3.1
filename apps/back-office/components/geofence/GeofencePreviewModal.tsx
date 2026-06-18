'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, MapPin, X } from 'lucide-react';

import {
  buildGoogleMapsExternalUrl,
  formatGpsCoords,
  resolveGeofenceRadiusM,
} from '../../lib/site-geofence';
import { GeofenceGoogleMap } from './GeofenceGoogleMap';

export function GeofencePreviewModal({
  lat,
  lng,
  radiusM,
  title,
  onClose,
  onCoordsChange,
}: {
  lat: number;
  lng: number;
  radiusM: number;
  title?: string;
  onClose: () => void;
  onCoordsChange?: (lat: number, lng: number) => void;
}) {
  const [editLat, setEditLat] = useState(lat);
  const [editLng, setEditLng] = useState(lng);
  const radius = resolveGeofenceRadiusM(radiusM);

  useEffect(() => {
    setEditLat(lat);
    setEditLng(lng);
  }, [lat, lng]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const hasCoords =
    Number.isFinite(editLat) && Number.isFinite(editLng) && !(editLat === 0 && editLng === 0);

  if (!hasCoords) return null;

  const mapsUrl = buildGoogleMapsExternalUrl(editLat, editLng, radius);

  const handleCoordsChange = (nextLat: number, nextLng: number) => {
    setEditLat(nextLat);
    setEditLng(nextLng);
    onCoordsChange?.(nextLat, nextLng);
  };

  return createPortal(
    <div className="fixed inset-0 z-[320] flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ? `${title} geofence preview` : 'Geofence preview'}
        className="relative flex h-[min(92vh,820px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/96 shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] backdrop-blur-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase tracking-wide text-slate-900">
              {title?.trim() || 'Geofence preview'}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
              {formatGpsCoords(editLat, editLng)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Google Maps
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-slate-100"
              aria-label="Close geofence preview"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-slate-100">
          <GeofenceGoogleMap
            lat={editLat}
            lng={editLng}
            radiusM={radius}
            onCoordsChange={handleCoordsChange}
          />

          <div className="pointer-events-none absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full border border-orange-200/90 bg-orange-50/95 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-orange-800 shadow-sm backdrop-blur-sm">
            <MapPin className="h-3.5 w-3.5" />
            {radius}m radius
          </div>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-xs font-medium text-slate-500">
          Click the map or drag the pin to set GPS coordinates. The orange circle shows the check-in
          geofence radius.
        </div>
      </div>
    </div>,
    document.body,
  );
}
