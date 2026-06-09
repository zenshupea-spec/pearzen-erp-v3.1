'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  geolocationSupported,
  queryGeolocationPermission,
  watchDeviceGeolocation,
  type GeolocationPermissionState,
} from '../../lib/device-geolocation';
import { getDistanceInMeters } from '../../lib/geofence';
import { DEFAULT_GEOFENCE_RADIUS_M } from '../../lib/site-geofence';

export type CafeSiteGeofence = {
  siteLat: number | null;
  siteLng: number | null;
  geofenceRadiusM: number;
};

type LiveCoords = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  updatedAt: number;
};

type CafeGeolocationContextValue = {
  supported: boolean;
  permission: GeolocationPermissionState;
  watching: boolean;
  requesting: boolean;
  coords: LiveCoords | null;
  distanceM: number | null;
  inBounds: boolean | null;
  geofenceRadiusM: number;
  error: string | null;
  enableLocation: () => void;
  refreshPermission: () => Promise<void>;
  waitForFreshCoords: (maxAgeMs?: number) => Promise<
    | { ok: true; latitude: number; longitude: number }
    | { ok: false; error: string }
  >;
};

const CafeGeolocationContext = createContext<CafeGeolocationContextValue | null>(null);

export function CafeGeolocationProvider({
  site,
  children,
}: {
  site: CafeSiteGeofence | null;
  children: React.ReactNode;
}) {
  const supported = geolocationSupported();
  const [permission, setPermission] = useState<GeolocationPermissionState>(
    supported ? 'unknown' : 'unsupported',
  );
  const [watching, setWatching] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [coords, setCoords] = useState<LiveCoords | null>(null);
  const [error, setError] = useState<string | null>(null);

  const watchHandleRef = useRef<{ stop: () => void } | null>(null);
  const coordsRef = useRef<LiveCoords | null>(null);
  const waitersRef = useRef<Array<(coords: LiveCoords) => void>>([]);

  const refreshPermission = useCallback(async () => {
    if (!supported) {
      setPermission('unsupported');
      return;
    }
    setPermission(await queryGeolocationPermission());
  }, [supported]);

  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  const stopWatch = useCallback(() => {
    watchHandleRef.current?.stop();
    watchHandleRef.current = null;
    setWatching(false);
  }, []);

  useEffect(() => {
    return () => {
      stopWatch();
    };
  }, [stopWatch]);

  const notifyWaiters = useCallback((next: LiveCoords) => {
    if (!waitersRef.current.length) return;
    const waiters = waitersRef.current;
    waitersRef.current = [];
    waiters.forEach((resolve) => resolve(next));
  }, []);

  const startWatch = useCallback(() => {
    if (!supported) {
      setError('GPS is not available. Open this page over HTTPS on your phone.');
      return;
    }

    stopWatch();
    setRequesting(true);
    setError(null);

    const handle = watchDeviceGeolocation({
      highAccuracy: true,
      onUpdate: (position) => {
        const next: LiveCoords = {
          latitude: position.latitude,
          longitude: position.longitude,
          accuracyM: position.accuracyM,
          updatedAt: Date.now(),
        };
        coordsRef.current = next;
        setCoords(next);
        setWatching(true);
        setRequesting(false);
        setError(null);
        void refreshPermission().then(() => setPermission((p) => (p === 'unknown' ? 'granted' : p)));
        notifyWaiters(next);
      },
      onError: (message) => {
        setRequesting(false);
        setError(message);
        void refreshPermission();
      },
    });

    if (!handle) {
      setRequesting(false);
      setError('Could not start GPS on this device.');
      return;
    }

    watchHandleRef.current = handle;
    setWatching(true);
  }, [notifyWaiters, refreshPermission, stopWatch, supported]);

  const enableLocation = useCallback(() => {
    startWatch();
  }, [startWatch]);

  useEffect(() => {
    if (!supported || watching || requesting) return;
    if (permission !== 'granted') return;
    startWatch();
  }, [permission, requesting, startWatch, supported, watching]);

  const waitForFreshCoords = useCallback(
    (maxAgeMs = 20_000): Promise<
      | { ok: true; latitude: number; longitude: number }
      | { ok: false; error: string }
    > => {
      const current = coordsRef.current;
      if (current && Date.now() - current.updatedAt <= maxAgeMs) {
        return Promise.resolve({
          ok: true,
          latitude: current.latitude,
          longitude: current.longitude,
        });
      }

      if (!watchHandleRef.current) {
        startWatch();
      } else {
        setRequesting(true);
      }

      return new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
          waitersRef.current = waitersRef.current.filter((fn) => fn !== onFix);
          setRequesting(false);
          const latest = coordsRef.current;
          if (latest) {
            resolve({
              ok: true,
              latitude: latest.latitude,
              longitude: latest.longitude,
            });
            return;
          }
          resolve({
            ok: false,
            error: error ?? 'Still waiting for GPS. Keep location enabled and try again.',
          });
        }, 35_000);

        const onFix = (next: LiveCoords) => {
          window.clearTimeout(timeout);
          setRequesting(false);
          resolve({ ok: true, latitude: next.latitude, longitude: next.longitude });
        };

        waitersRef.current.push(onFix);
      });
    },
    [error, startWatch],
  );

  const distanceM = useMemo(() => {
    if (!coords || site?.siteLat == null || site.siteLng == null) return null;
    return getDistanceInMeters(coords.latitude, coords.longitude, site.siteLat, site.siteLng);
  }, [coords, site?.siteLat, site?.siteLng]);

  const inBounds = useMemo(() => {
    if (distanceM == null || !site) return null;
    const radius = site.geofenceRadiusM || DEFAULT_GEOFENCE_RADIUS_M;
    return distanceM <= radius;
  }, [distanceM, site]);

  const geofenceRadiusM = site?.geofenceRadiusM || DEFAULT_GEOFENCE_RADIUS_M;

  const value = useMemo<CafeGeolocationContextValue>(
    () => ({
      supported,
      permission,
      watching,
      requesting,
      coords,
      distanceM,
      inBounds,
      geofenceRadiusM,
      error,
      enableLocation,
      refreshPermission,
      waitForFreshCoords,
    }),
    [
      supported,
      permission,
      watching,
      requesting,
      coords,
      distanceM,
      inBounds,
      geofenceRadiusM,
      error,
      enableLocation,
      refreshPermission,
      waitForFreshCoords,
    ],
  );

  return (
    <CafeGeolocationContext.Provider value={value}>{children}</CafeGeolocationContext.Provider>
  );
}

export function useCafeGeolocation() {
  const ctx = useContext(CafeGeolocationContext);
  if (!ctx) {
    throw new Error('useCafeGeolocation must be used within CafeGeolocationProvider');
  }
  return ctx;
}

export function useOptionalCafeGeolocation() {
  return useContext(CafeGeolocationContext);
}
