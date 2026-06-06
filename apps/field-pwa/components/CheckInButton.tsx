'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getGuardAttendanceState, processLocationPing } from '../app/actions';
import {
  savePingToVault,
  getPingsFromVault,
  clearPingFromVault,
  type OfflinePing,
} from '../lib/offline-vault';
import { getDistanceInMeters } from '../lib/geofence';

// --- HARDCODED TEST SITE (London DevTools Coordinates) ---
const TARGET_LAT = 51.507351;
const TARGET_LNG = -0.127758;
const TARGET_RADIUS_METERS = 50;
// ---------------------------------------------------------

type ButtonState =
  | 'LOADING_STATE'
  | 'IDLE'
  | 'LOCATING'
  | 'CAMERA_FEED'
  | 'SYNCING'
  | 'SECURED'
  | 'OUT_OF_BOUNDS';
type ActionType = 'CHECK_IN' | 'CHECK_OUT';

type TempLocation = {
  lat: number;
  lng: number;
  time: string;
  action: ActionType;
};

type CheckInButtonProps = {
  empNumber?: string;
};

export default function CheckInButton({ empNumber = '76' }: CheckInButtonProps) {
  const [uiState, setUiState] = useState<ButtonState>('LOADING_STATE');
  const [nextAction, setNextAction] = useState<ActionType>('CHECK_IN');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [distanceAway, setDistanceAway] = useState<number | null>(null);
  const [tempLocation, setTempLocation] = useState<TempLocation | null>(null);
  const [shiftData, setShiftData] = useState<any>(null);

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
      try {
        const res = await getGuardAttendanceState(empNumber);
        if (res.status === 'READY') {
          setNextAction(res.nextAction as ActionType);
          setShiftData(res);
        } else {
          setNextAction('CHECK_IN');
          setShiftData(null);
        }
        setUiState('IDLE');
      } catch (error) {
        console.error("Failed to fetch state:", error);
        setUiState('IDLE');
      }
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
    };

    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine) handleOnline();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      stopCamera();
    };
  }, [empNumber, stopCamera]);

  const startCamera = async () => {
    setUiState('CAMERA_FEED');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      alert('Camera access is required to check in.');
      setUiState('IDLE');
      setTempLocation(null);
    }
  };

  const handlePing = async () => {
    if (uiState === 'OUT_OF_BOUNDS') {
      setUiState('IDLE');
      setDistanceAway(null);
      stopCamera();
      setTempLocation(null);
      return;
    }

    if (uiState !== 'IDLE') return;
    setUiState('LOCATING');

    if (!navigator.geolocation) {
      alert('Geolocation is not supported.');
      setUiState('IDLE');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const distance = getDistanceInMeters(lat, lng, TARGET_LAT, TARGET_LNG);

        if (distance > TARGET_RADIUS_METERS) {
          setDistanceAway(distance);
          setUiState('OUT_OF_BOUNDS');
          return;
        }

        setTempLocation({ lat, lng, time: new Date().toISOString(), action: nextAction });
        await startCamera();
      },
      () => {
        alert('Failed to acquire GPS lock. Ensure location services are on.');
        setUiState('IDLE');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const capturePhotoAndSync = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const pending = tempLocation;

    if (!video || !canvas || !pending) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photoBase64 = canvas.toDataURL('image/jpeg', 0.85);

    stopCamera();
    setUiState('SYNCING');
    setTempLocation(null);

    const { lat, lng, time, action } = pending;

    if (navigator.onLine) {
      const result = await processLocationPing({
        emp_number: empNumber,
        action_type: action,
        device_time: time,
        latitude: lat,
        longitude: lng,
        sync_type: 'LIVE_PING',
        photo_base64: photoBase64,
      });
      if (result.success) triggerSecuredState();
      else await cacheOfflinePing(action, lat, lng, time, photoBase64);
    } else {
      await cacheOfflinePing(action, lat, lng, time, photoBase64);
    }
  };

  const cacheOfflinePing = async (action: ActionType, lat: number, lng: number, time: string, photoBase64: string) => {
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
    triggerSecuredState();
  };

  const triggerSecuredState = () => {
    setUiState('SECURED');
    setTimeout(() => {
      setNextAction((prev) => (prev === 'CHECK_IN' ? 'CHECK_OUT' : 'CHECK_IN'));
      setUiState('IDLE');
    }, 3000);
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const baseStyle = 'w-56 h-56 rounded-full flex flex-col items-center justify-center font-bold text-xl tracking-wider uppercase transition-all shadow-2xl active:scale-95 mx-auto border-8';
  let dynamicStyle = '';
  let buttonText = '';
  let subText = '';

  switch (uiState) {
    case 'LOCATING':
      dynamicStyle = 'bg-yellow-500 text-yellow-900 border-yellow-300 animate-pulse';
      buttonText = 'ACQUIRING'; subText = 'AWAITING GPS LOCK'; break;
    case 'SYNCING':
      dynamicStyle = 'bg-blue-500 text-white border-blue-300 animate-pulse';
      buttonText = 'SYNCING'; subText = 'UPLOADING TO VAULT'; break;
    case 'OUT_OF_BOUNDS':
      dynamicStyle = 'bg-red-600 text-white border-red-900 ring-4 ring-red-500 shadow-[0_0_30px_rgba(220,38,38,0.7)] hover:bg-red-700';
      buttonText = 'TOO FAR'; subText = `${Math.round(distanceAway ?? 0)}m AWAY (MAX ${TARGET_RADIUS_METERS}m)`; break;
    case 'SECURED':
      dynamicStyle = 'bg-slate-900 text-emerald-400 border-emerald-900 ring-4 ring-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.5)]';
      buttonText = isOnline ? 'SECURED' : 'SAVED OFFLINE'; subText = isOnline ? 'IDENTITY CONFIRMED' : 'QUEUED IN VAULT'; break;
    case 'LOADING_STATE':
      dynamicStyle = 'bg-slate-800 text-slate-400 cursor-not-allowed border-white/20';
      buttonText = 'INITIALIZING...'; subText = ''; break;
    case 'IDLE':
    default:
      if (!shiftData) {
        dynamicStyle = 'bg-slate-800 text-slate-400 cursor-not-allowed border-white/20 opacity-50';
        buttonText = 'STANDBY'; subText = 'NO SHIFT SCHEDULED';
      } else if (nextAction === 'CHECK_IN') {
        dynamicStyle = 'bg-emerald-500 text-white border-white/40 hover:bg-emerald-400';
        buttonText = 'CHECK IN'; subText = 'READY';
      } else {
        dynamicStyle = 'bg-orange-500 text-white border-white/40 hover:bg-orange-400';
        buttonText = 'CHECK OUT'; subText = 'ON SHIFT';
      }
      break;
  }

  return (
    <div className="flex flex-col w-full px-4 space-y-6">
      {/* HUD PANEL */}
      <div className="bg-slate-900/80 border border-slate-700 p-6 rounded-2xl backdrop-blur-md w-full max-w-md mx-auto mt-4">
        <h2 className="text-emerald-400 text-xs font-bold tracking-widest uppercase mb-4 border-b border-slate-700/50 pb-2">ACTIVE DEPLOYMENT</h2>
        {uiState === 'LOADING_STATE' ? (
          <div className="animate-pulse h-12 bg-slate-700 rounded"></div>
        ) : shiftData ? (
          <div className="space-y-3">
            <div>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">LOCATION</p>
              <p className="text-slate-200 font-medium text-lg uppercase tracking-wide">{shiftData.locationName}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">START</p>
                <p className="text-emerald-400 font-mono text-sm">{formatTime(shiftData.startTime)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">END</p>
                <p className="text-emerald-400 font-mono text-sm">{formatTime(shiftData.endTime)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-slate-400 text-sm tracking-wider uppercase">Standby.</p>
            <p className="text-slate-500 text-xs mt-1">No orders received from command.</p>
          </div>
        )}
      </div>

      {/* CORE INTERFACE */}
      {uiState === 'CAMERA_FEED' ? (
        <div className="flex flex-col items-center gap-4 w-full my-4 animate-in fade-in zoom-in duration-300">
          <div className="relative w-64 h-80 rounded-3xl overflow-hidden border-4 border-slate-700 shadow-2xl">
            <video ref={videoRef} autoPlay playsInline muted className="object-cover w-full h-full transform scale-x-[-1]" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 border-[40px] border-black/30 flex items-center justify-center">
              <div className="w-full h-full border-2 border-dashed border-white/50 rounded-lg" />
            </div>
          </div>
          <button type="button" onClick={capturePhotoAndSync} className="w-20 h-20 rounded-full bg-white border-4 border-slate-300 shadow-xl active:scale-90 transition-all flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-300" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 w-full my-4">
          <button type="button" onClick={handlePing} disabled={uiState === 'LOADING_STATE' || !shiftData} className={`${baseStyle} ${dynamicStyle}`}>
            <span>{buttonText}</span>
            {subText && <span className="text-[10px] opacity-80 mt-1 tracking-widest">{subText}</span>}
          </button>
          {!isOnline && <p className="text-center text-xs font-semibold text-orange-400 tracking-wide animate-pulse mt-4">⚠️ OFFLINE MODE ACTIVE</p>}
        </div>
      )}
    </div>
  );
}