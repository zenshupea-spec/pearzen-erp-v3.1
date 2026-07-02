'use client';

import { useEffect, useRef, useState } from 'react';

import { zoomForGeofenceRadiusM } from '../../lib/site-geofence';

const GOOGLE_SCRIPT_ID = 'google-maps-js';
const LEAFLET_STYLE_ID = 'leaflet-css';
const LEAFLET_SCRIPT_ID = 'leaflet-js';

let googleScriptPromise: Promise<void> | null = null;
let leafletScriptPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();

  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.maps) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps')));
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

function loadLeaflet(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.L) return Promise.resolve();

  if (leafletScriptPromise) return leafletScriptPromise;

  leafletScriptPromise = new Promise((resolve, reject) => {
    if (!document.getElementById(LEAFLET_STYLE_ID)) {
      const link = document.createElement('link');
      link.id = LEAFLET_STYLE_ID;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const existing = document.getElementById(LEAFLET_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.L) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Leaflet')));
      return;
    }

    const script = document.createElement('script');
    script.id = LEAFLET_SCRIPT_ID;
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });

  return leafletScriptPromise;
}

async function resolveMapsApiKey(): Promise<string | null> {
  const fromBuild = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (fromBuild) return fromBuild;

  try {
    const res = await fetch('/api/maps-key', { cache: 'no-store', credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { key?: string | null };
    return data.key?.trim() || null;
  } catch {
    return null;
  }
}

function fitGoogleMapToCircle(map: google.maps.Map, circle: google.maps.Circle) {
  const bounds = circle.getBounds();
  if (bounds) map.fitBounds(bounds);
}

function initGoogleMap(
  container: HTMLDivElement,
  lat: number,
  lng: number,
  radiusM: number,
  onCoordsChangeRef: React.RefObject<((lat: number, lng: number) => void) | undefined>,
) {
  const listeners: google.maps.MapsEventListener[] = [];
  const center = { lat, lng };

  const map = new window.google!.maps.Map(container, {
    center,
    zoom: zoomForGeofenceRadiusM(lat, radiusM),
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    gestureHandling: 'greedy',
  });

  const circle = new window.google!.maps.Circle({
    map,
    center,
    radius: radiusM,
    strokeColor: '#ea580c',
    strokeOpacity: 1,
    strokeWeight: 2.5,
    fillColor: '#f97316',
    fillOpacity: 0.22,
  });

  const marker = new window.google!.maps.Marker({
    map,
    position: center,
    draggable: true,
    icon: {
      path: window.google!.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: '#ea580c',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    },
  });

  const applyCoords = (nextLat: number, nextLng: number) => {
    const nextCenter = { lat: nextLat, lng: nextLng };
    circle.setCenter(nextCenter);
    marker.setPosition(nextCenter);
    map.panTo(nextCenter);
    fitGoogleMapToCircle(map, circle);
    onCoordsChangeRef.current?.(nextLat, nextLng);
  };

  listeners.push(
    map.addListener('click', (event) => {
      const clicked = event.latLng;
      if (!clicked) return;
      applyCoords(clicked.lat(), clicked.lng());
    }),
  );

  listeners.push(
    marker.addListener('dragend', () => {
      const position = marker.getPosition();
      if (!position) return;
      applyCoords(position.lat(), position.lng());
    }),
  );

  fitGoogleMapToCircle(map, circle);

  return {
    mode: 'google' as const,
    map,
    circle,
    marker,
    cleanup: () => {
      listeners.forEach((listener) => listener.remove());
      marker.setMap(null);
      circle.setMap(null);
    },
    sync: (nextLat: number, nextLng: number, nextRadiusM: number) => {
      const nextCenter = { lat: nextLat, lng: nextLng };
      circle.setCenter(nextCenter);
      circle.setRadius(nextRadiusM);
      marker.setPosition(nextCenter);
      fitGoogleMapToCircle(map, circle);
    },
  };
}

function initLeafletMap(
  container: HTMLDivElement,
  lat: number,
  lng: number,
  radiusM: number,
  onCoordsChangeRef: React.RefObject<((lat: number, lng: number) => void) | undefined>,
) {
  const L = window.L!;
  const zoom = zoomForGeofenceRadiusM(lat, radiusM);

  const map = L.map(container, { zoomControl: true }).setView([lat, lng], zoom);

  L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    subdomains: ['0', '1', '2', '3'],
    attribution: '&copy; Google',
    maxZoom: 21,
  }).addTo(map);

  const circle = L.circle([lat, lng], {
    radius: radiusM,
    color: '#ea580c',
    fillColor: '#f97316',
    fillOpacity: 0.22,
    weight: 2.5,
  }).addTo(map);

  const marker = L.circleMarker([lat, lng], {
    radius: 9,
    fillColor: '#ea580c',
    color: '#ffffff',
    weight: 2,
    fillOpacity: 1,
    draggable: true,
  }).addTo(map);

  const applyCoords = (nextLat: number, nextLng: number) => {
    const nextCenter: [number, number] = [nextLat, nextLng];
    circle.setLatLng(nextCenter);
    marker.setLatLng(nextCenter);
    map.fitBounds(circle.getBounds());
    onCoordsChangeRef.current?.(nextLat, nextLng);
  };

  map.on('click', (event) => {
    applyCoords(event.latlng.lat, event.latlng.lng);
  });

  marker.on('dragend', (event) => {
    applyCoords(event.latlng.lat, event.latlng.lng);
  });

  map.fitBounds(circle.getBounds());

  return {
    mode: 'leaflet' as const,
    map,
    circle,
    marker,
    cleanup: () => {
      map.remove();
    },
    sync: (nextLat: number, nextLng: number, nextRadiusM: number) => {
      const nextCenter: [number, number] = [nextLat, nextLng];
      circle.setLatLng(nextCenter);
      circle.setRadius(nextRadiusM);
      marker.setLatLng(nextCenter);
      map.fitBounds(circle.getBounds());
    },
  };
}

type MapRuntime =
  | ReturnType<typeof initGoogleMap>
  | ReturnType<typeof initLeafletMap>;

export function GeofenceGoogleMap({
  lat,
  lng,
  radiusM,
  onCoordsChange,
}: {
  lat: number;
  lng: number;
  radiusM: number;
  onCoordsChange?: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<MapRuntime | null>(null);
  const onCoordsChangeRef = useRef(onCoordsChange);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  onCoordsChangeRef.current = onCoordsChange;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!containerRef.current) return;

      const apiKey = await resolveMapsApiKey();

      const mountLeaflet = async () => {
        await loadLeaflet();
        if (cancelled || !containerRef.current || !window.L) return false;
        runtimeRef.current?.cleanup();
        runtimeRef.current = initLeafletMap(
          containerRef.current,
          lat,
          lng,
          radiusM,
          onCoordsChangeRef,
        );
        if (!cancelled) {
          setLoadError(null);
          setLoading(false);
        }
        return true;
      };

      try {
        if (apiKey) {
          try {
            await loadGoogleMapsScript(apiKey);
            if (!cancelled && containerRef.current && window.google?.maps) {
              runtimeRef.current?.cleanup();
              runtimeRef.current = initGoogleMap(
                containerRef.current,
                lat,
                lng,
                radiusM,
                onCoordsChangeRef,
              );
              if (!cancelled) {
                setLoadError(null);
                setLoading(false);
              }
              return;
            }
          } catch {
            // Invalid or blocked API key — fall through to Leaflet.
          }
        }

        const mounted = await mountLeaflet();
        if (!mounted && !cancelled) {
          setLoadError('Could not load the map. Check your connection and try again.');
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Could not load the map. Check your connection and try again.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      runtimeRef.current?.cleanup();
      runtimeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    runtimeRef.current?.sync(lat, lng, radiusM);
  }, [lat, lng, radiusM]);

  if (loadError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 px-6 text-center">
        <p className="text-sm font-bold text-slate-700">Map unavailable</p>
        <p className="max-w-md text-xs font-medium text-slate-500">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-500">
          Loading map…
        </div>
      ) : null}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
