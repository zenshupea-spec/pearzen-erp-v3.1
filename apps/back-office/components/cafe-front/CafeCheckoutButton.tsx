'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getCafeShiftCheckinContext,
  submitCafeShiftCheckout,
  type CafeShiftCheckinContext,
} from '../../app/cafe-front/actions';
import { useOptionalCafeGeolocation } from './CafeGeolocationContext';
import { readDeviceGeolocationWithRetry } from '../../lib/device-geolocation';
import { getDistanceInMeters } from '../../lib/geofence';
import { DEFAULT_GEOFENCE_RADIUS_M } from '../../lib/site-geofence';

type ButtonState =
  | 'LOADING'
  | 'IDLE'
  | 'LOCATING'
  | 'CAMERA'
  | 'SYNCING'
  | 'SECURED'
  | 'OUT_OF_BOUNDS';

function formatTime(value: string) {
  const [h, m] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function CafeCheckoutButton({
  forced = false,
  onComplete,
  onCancel,
}: {
  forced?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}) {
  const geoWatch = useOptionalCafeGeolocation();
  const [uiState, setUiState] = useState<ButtonState>('LOADING');
  const [context, setContext] = useState<CafeShiftCheckinContext | null>(null);
  const [distanceAway, setDistanceAway] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pendingCoords = useRef<{ lat: number; lng: number } | null>(null);

  const stopCamera = useCallback(() => {
    const video = videoRef.current;
    if (video?.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  }, []);

  const refreshContext = useCallback(async () => {
    const ctx = await getCafeShiftCheckinContext();
    setContext(ctx);
    if (!ctx) {
      setUiState('IDLE');
      return;
    }
    if (ctx.checkedOutToday) {
      setUiState('SECURED');
      return;
    }
    setUiState(ctx.canCheckOut ? 'IDLE' : 'SECURED');
  }, []);

  useEffect(() => {
    void refreshContext();
    return () => stopCamera();
  }, [refreshContext, stopCamera]);

  const verifyGpsAtSite = (
    lat: number,
    lng: number,
    ctx: CafeShiftCheckinContext,
  ): { ok: true } | { ok: false; distance: number } => {
    if (ctx.siteLat == null || ctx.siteLng == null) {
      return { ok: false, distance: 0 };
    }
    const distance = getDistanceInMeters(lat, lng, ctx.siteLat, ctx.siteLng);
    if (distance > ctx.geofenceRadiusM) {
      return { ok: false, distance };
    }
    return { ok: true };
  };

  const startCamera = async () => {
    setUiState('CAMERA');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setErrorMessage('Camera access is required to verify your identity.');
      setUiState('IDLE');
      pendingCoords.current = null;
    }
  };

  const beginCheckout = async () => {
    if (!context || uiState !== 'IDLE') return;
    setErrorMessage(null);

    if (!context.canCheckOut) {
      setErrorMessage('You are not on an active shift.');
      return;
    }

    setUiState('LOCATING');
    let geo: { ok: true; latitude: number; longitude: number } | { ok: false; error: string };

    if (geoWatch) {
      if (!geoWatch.watching) {
        geoWatch.enableLocation();
      }
      geo = await geoWatch.waitForFreshCoords();
    } else {
      geo = await readDeviceGeolocationWithRetry();
    }

    if (!geo.ok) {
      setErrorMessage(geo.error);
      setUiState('IDLE');
      return;
    }

    const gpsCheck = verifyGpsAtSite(geo.latitude, geo.longitude, context);
    if (!gpsCheck.ok) {
      setDistanceAway(gpsCheck.distance);
      setUiState('OUT_OF_BOUNDS');
      return;
    }

    pendingCoords.current = { lat: geo.latitude, lng: geo.longitude };
    await startCamera();
  };

  const captureAndSubmit = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const coords = pendingCoords.current;

    if (!video || !canvas || !coords) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      stopCamera();
      setUiState('IDLE');
      pendingCoords.current = null;
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let photoBase64: string;
    try {
      photoBase64 = canvas.toDataURL('image/webp', 0.8);
    } catch {
      photoBase64 = canvas.toDataURL('image/jpeg', 0.85);
    }

    stopCamera();
    setUiState('SYNCING');
    pendingCoords.current = null;

    const result = await submitCafeShiftCheckout({
      photoBase64,
      latitude: coords.lat,
      longitude: coords.lng,
    });

    if (result.ok) {
      setUiState('SECURED');
      setTimeout(() => {
        onComplete?.();
        window.location.reload();
      }, 1200);
      return;
    }

    setErrorMessage(result.error ?? 'Check-out failed.');
    setUiState('IDLE');
  };

  const handleMainButton = () => {
    if (uiState === 'OUT_OF_BOUNDS') {
      setDistanceAway(null);
      setErrorMessage(null);
      setUiState('IDLE');
      return;
    }
    beginCheckout();
  };

  const circleBase =
    'mx-auto flex h-52 w-52 flex-col items-center justify-center rounded-full border-[6px] font-black uppercase tracking-wide shadow-2xl transition-all active:scale-95 touch-manipulation';

  let dynamicStyle = '';
  let buttonText = '';
  let subText = '';
  let disabled = uiState === 'LOADING' || uiState === 'SYNCING' || uiState === 'SECURED';

  switch (uiState) {
    case 'LOADING':
      dynamicStyle = 'cursor-wait border-slate-200 bg-slate-200 text-slate-500';
      buttonText = 'Loading';
      disabled = true;
      break;
    case 'LOCATING':
      dynamicStyle =
        'animate-pulse cursor-wait border-amber-300 bg-amber-500 text-amber-950';
      buttonText = 'Locating';
      subText = geoWatch?.watching
        ? 'Using live GPS on this page'
        : 'Allow location when your phone asks';
      disabled = true;
      break;
    case 'SYNCING':
      dynamicStyle =
        'animate-pulse cursor-wait border-sky-300 bg-sky-600 text-white';
      buttonText = 'Syncing';
      subText = 'Recording check-out';
      disabled = true;
      break;
    case 'OUT_OF_BOUNDS':
      dynamicStyle =
        'border-red-900 bg-red-600 text-white shadow-[0_0_30px_rgba(220,38,38,0.6)] hover:bg-red-700';
      buttonText = 'Too far';
      subText = `${Math.round(distanceAway ?? 0)}m away (max ${context?.geofenceRadiusM ?? DEFAULT_GEOFENCE_RADIUS_M}m)`;
      break;
    case 'SECURED':
      dynamicStyle =
        'border-emerald-900 bg-slate-900 text-emerald-400 ring-4 ring-emerald-400';
      buttonText = 'Done';
      subText = 'Shift complete';
      disabled = true;
      break;
    case 'IDLE':
    default:
      dynamicStyle =
        'border-slate-700 bg-slate-800 text-white shadow-slate-900/40 hover:bg-slate-700';
      buttonText = 'Check-out';
      subText = geoWatch?.inBounds
        ? 'On site · tap to selfie'
        : geoWatch?.watching
          ? 'GPS on · return to site'
          : 'Enable location above first';
      break;
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {forced ? (
        <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
            Portal closed
          </p>
          <p className="mt-1 text-xs font-semibold text-amber-900">
            Access ended at {context ? formatTime(context.portalGraceEnd) : 'close + 1 hour'}.
            Check out with GPS + selfie to end your shift.
          </p>
        </div>
      ) : null}

      {context?.siteName && uiState !== 'LOADING' ? (
        <div className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-center shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            End shift at
          </p>
          <p className="mt-1 text-sm font-black uppercase text-slate-900">{context.siteName}</p>
          {context.checkinAt ? (
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              Checked in at {new Date(context.checkinAt).toLocaleTimeString()}
            </p>
          ) : null}
        </div>
      ) : null}

      {errorMessage ? (
        <p className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-semibold text-rose-800">
          {errorMessage}
        </p>
      ) : null}

      {uiState === 'CAMERA' ? (
        <div className="flex w-full flex-col items-center gap-4">
          <div className="relative h-80 w-full max-w-xs overflow-hidden rounded-3xl border-4 border-slate-300 shadow-2xl">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full scale-x-[-1] object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 flex items-center justify-center border-[36px] border-black/25">
              <div className="h-full w-full rounded-lg border-2 border-dashed border-white/50" />
            </div>
          </div>
          <button
            type="button"
            onClick={captureAndSubmit}
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-slate-300 bg-white shadow-xl active:scale-90"
            aria-label="Capture checkout selfie"
          >
            <div className="h-16 w-16 rounded-full border border-slate-300 bg-slate-100" />
          </button>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Verify identity
          </span>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={handleMainButton}
            disabled={disabled}
            className={`${circleBase} ${dynamicStyle} ${disabled ? 'pointer-events-none' : ''}`}
          >
            <span className="text-2xl">{buttonText}</span>
            {subText ? (
              <span className="mt-1 max-w-[11rem] text-center text-[10px] font-semibold normal-case tracking-normal opacity-90">
                {subText}
              </span>
            ) : null}
          </button>
          {!forced && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
