'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getGuardAttendanceState, processLocationPing } from '../actions';
import {
  savePingToVault,
  getPingsFromVault,
  clearPingFromVault,
  type OfflinePing,
} from '../../lib/offline-vault';
import { getDistanceInMeters } from '../../lib/geofence';
import { scanSiteNFC } from '../../lib/location-verification';

type ButtonState =
  | 'LOADING_STATE'
  | 'IDLE'
  | 'LOCATING'
  | 'SCANNING_NFC'
  | 'CAMERA_FEED'
  | 'SYNCING'
  | 'SECURED'
  | 'OUT_OF_BOUNDS';
type ActionType = 'CHECK_IN' | 'CHECK_OUT';
type VerificationMode = 'A' | 'B' | 'C';

type ShiftPayload = {
  nextAction: ActionType;
  shiftId: string;
  locationName: string;
  startTime: string;
  endTime: string;
  checkoutOpensAt: string;
  siteLat: number | null;
  siteLng: number | null;
  geofenceRadius: number;
  verificationMode: VerificationMode;
  nfcTagId: string | null;
};

type TempLocation = {
  lat: number;
  lng: number;
  time: string;
  action: ActionType;
  nfcTag?: string;
  checkoutFlag?: 'EARLY' | 'NORMAL';
};

type CheckInButtonProps = {
  empNumber?: string;
  locationId?: string;
  layout?: 'default' | 'portal';
};

function formatTime(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isEarlyCheckout(checkoutOpensAt: string, now = new Date()) {
  return now < new Date(checkoutOpensAt);
}

export default function CheckInButton({
  empNumber = '76',
  layout = 'default',
}: CheckInButtonProps) {
  const isPortal = layout === 'portal';
  const [uiState, setUiState] = useState<ButtonState>('LOADING_STATE');
  const [nextAction, setNextAction] = useState<ActionType>('CHECK_IN');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [distanceAway, setDistanceAway] = useState<number | null>(null);
  const [tempLocation, setTempLocation] = useState<TempLocation | null>(null);
  const [shiftData, setShiftData] = useState<ShiftPayload | null>(null);
  const [securedMessage, setSecuredMessage] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stopCamera = useCallback(() => {
    const video = videoRef.current;
    if (video?.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    async function fetchState() {
      const res = await getGuardAttendanceState(empNumber);

      if (res.status === 'READY') {
        setNextAction(res.nextAction as ActionType);
        setShiftData({
          nextAction: res.nextAction as ActionType,
          shiftId: res.shiftId as string,
          locationName: res.locationName as string,
          startTime: res.startTime as string,
          endTime: res.endTime as string,
          checkoutOpensAt: res.checkoutOpensAt as string,
          siteLat: (res.siteLat as number | null) ?? null,
          siteLng: (res.siteLng as number | null) ?? null,
          geofenceRadius: (res.geofenceRadius as number) ?? 25,
          verificationMode: (res.verificationMode as VerificationMode) ?? 'B',
          nfcTagId: (res.nfcTagId as string | null) ?? null,
        });
      } else {
        setNextAction('CHECK_IN');
        setShiftData(null);
      }
      setUiState('IDLE');
    }

    fetchState();

    const handleOnline = async () => {
      setIsOnline(true);
      const pendingPings = await getPingsFromVault();

      if (pendingPings.length > 0) {
        for (const ping of pendingPings) {
          const result = await processLocationPing({
            emp_number: ping.emp_number,
            action_type: ping.action_type,
            device_time: ping.device_time,
            latitude: ping.latitude,
            longitude: ping.longitude,
            sync_type: ping.sync_type,
            photo_base64: ping.photo_base64,
          });
          if (result.success) await clearPingFromVault(ping.id);
        }
      }
      await fetchState();
    };

    const handleOffline = () => setIsOnline(false);
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchState();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);

    if (navigator.onLine) handleOnline();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
      stopCamera();
    };
  }, [empNumber, stopCamera]);

  const startCamera = async () => {
    setUiState('CAMERA_FEED');
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
    } catch (err) {
      console.error('Camera access denied or failed', err);
      alert('Camera access is required to verify your identity.');
      setUiState('IDLE');
      setTempLocation(null);
    }
  };

  const verifyGpsAtSite = (
    lat: number,
    lng: number,
  ): { ok: true } | { ok: false; distance: number } => {
    if (!shiftData?.siteLat || !shiftData?.siteLng) {
      return { ok: true };
    }
    const distance = getDistanceInMeters(
      lat,
      lng,
      shiftData.siteLat,
      shiftData.siteLng,
    );
    if (distance > shiftData.geofenceRadius) {
      return { ok: false, distance };
    }
    return { ok: true };
  };

  const confirmEarlyCheckout = (): boolean => {
    if (!shiftData) return false;
    const opensAt = formatTime(shiftData.checkoutOpensAt);
    return window.confirm(
      `You are checking out before ${opensAt}. This shift will be flagged for OM review and will not go straight to payroll. Continue?`,
    );
  };

  const beginVerification = async (checkoutFlag?: 'EARLY' | 'NORMAL') => {
    if (!shiftData) return;

    if (shiftData.verificationMode === 'A') {
      alert('This site uses roster-only verification. Contact your sector manager.');
      return;
    }

    if (shiftData.verificationMode === 'C') {
      setUiState('SCANNING_NFC');
      try {
        const tagId = await scanSiteNFC();
        const tagMatches =
          (shiftData.nfcTagId && tagId === shiftData.nfcTagId) ||
          tagId === shiftData.locationName;

        if (!tagMatches) {
          alert('NFC tag does not match your scheduled site. Scan the tag at your deployment.');
          setUiState('IDLE');
          return;
        }

        setTempLocation({
          lat: shiftData.siteLat ?? 0,
          lng: shiftData.siteLng ?? 0,
          time: new Date().toISOString(),
          action: nextAction,
          nfcTag: tagId,
          checkoutFlag,
        });
        await startCamera();
      } catch (err) {
        console.error('NFC scan failed', err);
        alert('NFC scan failed. Hold your phone against the site tag and try again.');
        setUiState('IDLE');
      }
      return;
    }

    setUiState('LOCATING');

    if (!navigator.geolocation) {
      alert('Geolocation is not supported on this device.');
      setUiState('IDLE');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const deviceTime = new Date().toISOString();
        const gpsCheck = verifyGpsAtSite(lat, lng);

        if (!gpsCheck.ok) {
          setDistanceAway(gpsCheck.distance);
          setUiState('OUT_OF_BOUNDS');
          return;
        }

        setTempLocation({
          lat,
          lng,
          time: deviceTime,
          action: nextAction,
          checkoutFlag,
        });
        await startCamera();
      },
      (error) => {
        console.error('GPS Error:', error);
        alert('Failed to acquire GPS lock. Ensure location services are on.');
        setUiState('IDLE');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handlePing = async () => {
    if (uiState === 'OUT_OF_BOUNDS') {
      setUiState('IDLE');
      setDistanceAway(null);
      stopCamera();
      setTempLocation(null);
      return;
    }

    if (uiState !== 'IDLE' || !shiftData) return;

    if (nextAction === 'CHECK_OUT' && isEarlyCheckout(shiftData.checkoutOpensAt)) {
      if (!confirmEarlyCheckout()) return;
      await beginVerification('EARLY');
      return;
    }

    await beginVerification('NORMAL');
  };

  const capturePhotoAndSync = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const pending = tempLocation;

    if (!video || !canvas || !pending) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      stopCamera();
      setUiState('IDLE');
      setTempLocation(null);
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
    setTempLocation(null);

    const { lat, lng, time, action, nfcTag, checkoutFlag } = pending;
    const online = navigator.onLine;

    if (online) {
      const result = await processLocationPing({
        emp_number: empNumber,
        action_type: action,
        device_time: time,
        latitude: lat,
        longitude: lng,
        sync_type: 'LIVE_PING',
        photo_base64: photoBase64,
        shift_id: shiftData?.shiftId,
        nfc_tag: nfcTag,
        checkout_flag: checkoutFlag,
      });
      if (result.success) {
        triggerSecuredState(action, result.flagged === true);
      } else if (result.error === 'EARLY_CHECKOUT') {
        if (confirmEarlyCheckout()) {
          const retry = await processLocationPing({
            emp_number: empNumber,
            action_type: action,
            device_time: time,
            latitude: lat,
            longitude: lng,
            sync_type: 'LIVE_PING',
            photo_base64: photoBase64,
            shift_id: shiftData?.shiftId,
            nfc_tag: nfcTag,
            checkout_flag: 'EARLY',
          });
          if (retry.success) {
            triggerSecuredState(action, true);
          } else {
            alert(retry.error ?? 'Check-out failed.');
            setUiState('IDLE');
          }
        } else {
          setUiState('IDLE');
        }
      } else {
        alert(result.error ?? 'Sync failed. Saving offline.');
        await cacheOfflinePing(action, lat, lng, time, photoBase64);
      }
    } else {
      await cacheOfflinePing(action, lat, lng, time, photoBase64);
    }
  };

  const cacheOfflinePing = async (
    action: ActionType,
    lat: number,
    lng: number,
    time: string,
    photoBase64: string,
  ) => {
    const offlineRecord: OfflinePing = {
      id: crypto.randomUUID(),
      emp_number: empNumber,
      action_type: action,
      latitude: lat,
      longitude: lng,
      sync_type: 'OFFLINE_CACHE',
      device_time: time,
      photo_base64: photoBase64,
    };
    await savePingToVault(offlineRecord);
    triggerSecuredState(action, false);
  };

  const triggerSecuredState = (action: ActionType, flagged: boolean) => {
    if (action === 'CHECK_OUT') {
      setSecuredMessage(
        flagged
          ? 'Shift flagged — OM desk will review before payroll'
          : 'Shift complete — sent for verification',
      );
    } else {
      setSecuredMessage(isOnline ? 'Checked in — on shift' : 'Checked in offline — queued');
    }
    setUiState('SECURED');
    setTimeout(() => {
      setNextAction((prev) => (prev === 'CHECK_IN' ? 'CHECK_OUT' : 'CHECK_IN'));
      setShiftData((prev) =>
        prev
          ? { ...prev, nextAction: prev.nextAction === 'CHECK_IN' ? 'CHECK_OUT' : 'CHECK_IN' }
          : prev,
      );
      setSecuredMessage('');
      setUiState('IDLE');
    }, 2500);
  };

  const circleBase =
    'w-52 h-52 rounded-full flex flex-col items-center justify-center font-black tracking-wide uppercase transition-all shadow-2xl active:scale-95 mx-auto border-8';

  let dynamicStyle = '';
  let buttonText = '';
  let subText = '';
  let disabled = uiState === 'LOADING_STATE';

  switch (uiState) {
    case 'SCANNING_NFC':
      dynamicStyle =
        'bg-indigo-600 text-white border-indigo-300 animate-pulse cursor-wait';
      buttonText = 'Scanning';
      subText = 'Hold phone to site NFC tag';
      disabled = true;
      break;
    case 'LOCATING':
      dynamicStyle =
        'bg-yellow-500 text-yellow-900 border-yellow-300 animate-pulse cursor-wait';
      buttonText = 'Locating';
      subText = 'Awaiting GPS lock';
      disabled = true;
      break;
    case 'SYNCING':
      dynamicStyle =
        'bg-blue-600 text-white border-blue-300 animate-pulse cursor-wait';
      buttonText = 'Syncing';
      subText = 'Uploading verification';
      disabled = true;
      break;
    case 'OUT_OF_BOUNDS':
      dynamicStyle =
        'bg-red-600 text-white border-red-900 ring-4 ring-red-500 shadow-[0_0_30px_rgba(220,38,38,0.7)] hover:bg-red-700';
      buttonText = 'Too far';
      subText = `${Math.round(distanceAway ?? 0)}m away (max ${shiftData?.geofenceRadius ?? 25}m)`;
      break;
    case 'SECURED':
      dynamicStyle =
        'bg-slate-900 text-emerald-400 border-emerald-900 ring-4 ring-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.5)]';
      buttonText = isOnline ? 'Verified' : 'Saved';
      subText = securedMessage || 'Identity confirmed';
      disabled = true;
      break;
    case 'LOADING_STATE':
      dynamicStyle = 'bg-slate-300 text-slate-500 border-slate-200 cursor-wait';
      buttonText = 'Loading';
      subText = '';
      disabled = true;
      break;
    case 'IDLE':
    default:
      if (!shiftData) {
        dynamicStyle =
          'bg-slate-300 text-slate-500 border-slate-200 cursor-not-allowed opacity-70';
        buttonText = isPortal ? 'Check-in' : 'Standby';
        subText = isPortal ? 'No shift today' : 'No shift scheduled';
        disabled = true;
      } else if (shiftData.verificationMode === 'A') {
        dynamicStyle =
          'bg-slate-300 text-slate-500 border-slate-200 cursor-not-allowed opacity-70';
        buttonText = 'Roster only';
        subText = 'Contact sector manager';
        disabled = true;
      } else if (nextAction === 'CHECK_IN') {
        dynamicStyle =
          'bg-emerald-500 text-white border-emerald-300 hover:bg-emerald-400 shadow-emerald-500/50 hover:shadow-emerald-400/60';
        buttonText = isPortal ? 'Check-in' : 'Check in';
        subText = shiftData.verificationMode === 'C' ? 'NFC + selfie' : 'GPS + selfie';
      } else {
        const early = isEarlyCheckout(shiftData.checkoutOpensAt);
        dynamicStyle =
          'bg-red-600 text-white border-red-400 hover:bg-red-500 shadow-red-600/50 ring-4 ring-red-500/30';
        buttonText = isPortal ? 'Check-out' : 'Check out';
        subText = early
          ? `Opens ${formatTime(shiftData.checkoutOpensAt)} · early = flagged`
          : 'Complete your shift';
      }
      break;
  }

  const checkoutHint =
    shiftData &&
    nextAction === 'CHECK_OUT' &&
    uiState === 'IDLE' &&
    !isEarlyCheckout(shiftData.checkoutOpensAt) ? (
      <p className="text-center text-xs font-medium text-emerald-700">
        Checkout window open until {formatTime(shiftData.endTime)}
      </p>
    ) : null;

  return (
    <div className={`flex w-full flex-col space-y-4 ${isPortal ? '' : 'px-4 space-y-6'}`}>
      {!isPortal && (
        <div className="mx-auto mt-4 w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/80 p-6 backdrop-blur-md">
          <h2 className="mb-4 border-b border-slate-700/50 pb-2 text-xs font-bold uppercase tracking-widest text-emerald-400">
            Active deployment
          </h2>
          {uiState === 'LOADING_STATE' ? (
            <div className="animate-pulse space-y-2 py-1">
              <div className="h-2 w-3/4 rounded bg-slate-700" />
              <div className="h-2 rounded bg-slate-700" />
            </div>
          ) : shiftData ? (
            <div className="space-y-3">
              <p className="text-lg font-medium uppercase tracking-wide text-slate-200">
                {shiftData.locationName}
              </p>
              <p className="font-mono text-sm text-emerald-400">
                {formatTime(shiftData.startTime)} – {formatTime(shiftData.endTime)}
              </p>
            </div>
          ) : (
            <p className="py-2 text-center text-sm uppercase tracking-wider text-slate-400">
              No shift scheduled today
            </p>
          )}
        </div>
      )}

      {isPortal && shiftData && uiState !== 'LOADING_STATE' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-center shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Today&apos;s shift
          </p>
          <p className="mt-1 text-sm font-black uppercase text-slate-900">
            {shiftData.locationName}
          </p>
          <p className="mt-0.5 font-mono text-xs text-blue-600">
            {formatTime(shiftData.startTime)} – {formatTime(shiftData.endTime)}
          </p>
          {nextAction === 'CHECK_OUT' && (
            <p className="mt-1 text-[10px] font-medium text-slate-500">
              Checkout from {formatTime(shiftData.checkoutOpensAt)}
            </p>
          )}
        </div>
      )}

      {isPortal && !shiftData && uiState !== 'LOADING_STATE' && (
        <p className="text-center text-xs font-medium text-slate-500">
          No active shift on roster for today. Contact your sector manager.
        </p>
      )}

      {uiState === 'CAMERA_FEED' ? (
        <div className="my-4 flex w-full animate-in fade-in zoom-in flex-col items-center gap-4 duration-300">
          <div className="relative h-80 w-64 overflow-hidden rounded-3xl border-4 border-slate-700 shadow-2xl">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full scale-x-[-1] transform object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 flex items-center justify-center border-[40px] border-black/30">
              <div className="h-full w-full rounded-lg border-2 border-dashed border-white/50" />
            </div>
          </div>

          <button
            type="button"
            onClick={capturePhotoAndSync}
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-slate-300 bg-white shadow-xl transition-all active:scale-90"
            aria-label="Capture photo"
          >
            <div className="h-16 w-16 rounded-full border border-slate-300 bg-slate-100" />
          </button>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Verify identity
          </span>
        </div>
      ) : (
        <div className="my-4 flex w-full flex-col items-center gap-4">
          <button
            type="button"
            onClick={handlePing}
            disabled={disabled}
            className={`${circleBase} ${dynamicStyle} ${disabled ? 'pointer-events-none' : ''}`}
          >
            <span className={isPortal ? 'text-2xl' : 'text-xl'}>{buttonText}</span>
            {subText && (
              <span
                className={`mt-1 max-w-[11rem] text-center opacity-90 ${
                  isPortal
                    ? 'text-[10px] font-semibold normal-case tracking-normal'
                    : 'text-[10px] tracking-widest'
                }`}
              >
                {subText}
              </span>
            )}
          </button>

          {checkoutHint}

          {!isOnline && (
            <p className="mt-2 animate-pulse text-center text-xs font-semibold tracking-wide text-orange-500">
              Offline mode — pings queued locally
            </p>
          )}
        </div>
      )}
    </div>
  );
}
