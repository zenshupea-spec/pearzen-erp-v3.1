export type DeviceGeoReadResult =
  | { ok: true; latitude: number; longitude: number; accuracyM?: number }
  | { ok: false; error: string };

export type GeolocationPermissionState =
  | 'unsupported'
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied';

export type DeviceGeoWatchHandle = {
  stop: () => void;
};

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  const mobile = isMobileDevice();
  switch (err.code) {
    case err.PERMISSION_DENIED:
      if (mobile && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        return 'Location blocked. Open Settings → Safari → Location → Allow, then return here and tap Check-in again.';
      }
      if (mobile && /Android/i.test(navigator.userAgent)) {
        return 'Location blocked. Tap the lock icon in Chrome → Permissions → Location → Allow, then try again.';
      }
      return 'Location permission denied. Tap Allow when your phone asks, or enable location for this site in browser settings.';
    case err.POSITION_UNAVAILABLE:
      return mobile
        ? 'GPS unavailable. Turn on Location Services (Settings → Privacy → Location) and try again near a window.'
        : 'Location unavailable. Turn on Location Services on this device, then try again.';
    case err.TIMEOUT:
      return mobile
        ? 'GPS is still locking on. Stay on this page — we keep trying while location is on.'
        : 'GPS timed out. Move to an open area or wait for a satellite fix, then try again.';
    default:
      return err.message || 'Could not read device location.';
  }
}

export function geolocationSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.isSecureContext && navigator.geolocation);
}

export async function queryGeolocationPermission(): Promise<GeolocationPermissionState> {
  if (typeof window === 'undefined' || !navigator.geolocation) return 'unsupported';
  if (!window.isSecureContext) return 'unsupported';
  if (!navigator.permissions?.query) return 'unknown';

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state as GeolocationPermissionState;
  } catch {
    return 'unknown';
  }
}

export function readDeviceGeolocation(options: {
  highAccuracy: boolean;
  timeoutMs: number;
}): Promise<DeviceGeoReadResult> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve({ ok: false, error: 'GPS is only available in the browser.' });
      return;
    }
    if (!window.isSecureContext) {
      resolve({
        ok: false,
        error: 'Location requires HTTPS. Open this page with a secure URL (not plain HTTP).',
      });
      return;
    }
    if (!navigator.geolocation) {
      resolve({
        ok: false,
        error: 'This browser does not support GPS.',
      });
      return;
    }

    let settled = false;
    const finish = (result: DeviceGeoReadResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      resolve(result);
    };

    const watchdog = window.setTimeout(() => {
      finish({
        ok: false,
        error: isMobileDevice()
          ? 'GPS is still locking on. Keep location enabled on this page and try again in a moment.'
          : 'GPS request timed out. Try again near a window with clear sky view.',
      });
    }, options.timeoutMs + 1500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        finish({
          ok: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
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

/** Keeps requesting GPS until a fix or timeout — more reliable on iPhone / Android than a single getCurrentPosition. */
export function acquireDeviceGeolocationPersistent(options?: {
  highAccuracy?: boolean;
  timeoutMs?: number;
}): Promise<DeviceGeoReadResult> {
  const highAccuracy = options?.highAccuracy ?? true;
  const timeoutMs = options?.timeoutMs ?? 45_000;

  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve({ ok: false, error: 'GPS is only available in the browser.' });
      return;
    }
    if (!window.isSecureContext) {
      resolve({
        ok: false,
        error: 'Location requires HTTPS. Open this page with a secure URL (not plain HTTP).',
      });
      return;
    }
    if (!navigator.geolocation) {
      resolve({ ok: false, error: 'This browser does not support GPS.' });
      return;
    }

    let settled = false;
    let watchId: number | null = null;

    const finish = (result: DeviceGeoReadResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      resolve(result);
    };

    const watchdog = window.setTimeout(() => {
      finish({
        ok: false,
        error: isMobileDevice()
          ? 'Still waiting for GPS. Leave location on for this page, move closer to a window, and tap Check-in again.'
          : 'GPS request timed out. Try again near a window with clear sky view.',
      });
    }, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        finish({
          ok: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
      },
      (err) => {
        finish({ ok: false, error: geolocationErrorMessage(err) });
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: 0,
        timeout: Math.min(timeoutMs, 30_000),
      },
    );
  });
}

export function watchDeviceGeolocation(options: {
  onUpdate: (position: { latitude: number; longitude: number; accuracyM: number }) => void;
  onError: (error: string) => void;
  highAccuracy?: boolean;
}): DeviceGeoWatchHandle | null {
  if (typeof window === 'undefined' || !window.isSecureContext || !navigator.geolocation) {
    options.onError('GPS is not available in this browser.');
    return null;
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      options.onUpdate({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
      });
    },
    (err) => {
      options.onError(geolocationErrorMessage(err));
    },
    {
      enableHighAccuracy: options.highAccuracy ?? true,
      maximumAge: 5_000,
      timeout: 30_000,
    },
  );

  return {
    stop: () => navigator.geolocation.clearWatch(watchId),
  };
}

export async function readDeviceGeolocationWithRetry(): Promise<DeviceGeoReadResult> {
  const persistent = await acquireDeviceGeolocationPersistent({
    highAccuracy: true,
    timeoutMs: 30_000,
  });
  if (persistent.ok) return persistent;

  const retryable =
    persistent.error.includes('locking') ||
    persistent.error.includes('timed out') ||
    persistent.error.includes('unavailable') ||
    persistent.error.includes('Still waiting');

  if (!retryable && !persistent.error.includes('permission')) {
    return persistent;
  }
  if (persistent.error.includes('permission') || persistent.error.includes('blocked')) {
    return persistent;
  }

  return acquireDeviceGeolocationPersistent({ highAccuracy: false, timeoutMs: 40_000 });
}
