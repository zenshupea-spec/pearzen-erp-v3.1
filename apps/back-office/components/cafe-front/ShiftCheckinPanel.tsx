'use client';

import { useRef, useState, useTransition } from 'react';
import { Camera, MapPin } from 'lucide-react';

import { ExecutiveGlassCard } from '../executive/ExecutiveVaultShell';
import { submitCafeShiftCheckin } from '../../app/cafe-front/actions';
import type { CafeShiftGate } from '../../lib/cafe-front-shift';

export function ShiftCheckinPanel({ shiftGate }: { shiftGate: CafeShiftGate }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const captureGps = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('GPS not available on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError('Could not read GPS location. Enable location services.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!photo || !coords) {
      setError('Selfie and GPS location are both required.');
      return;
    }
    startTransition(async () => {
      const result = await submitCafeShiftCheckin({
        photoBase64: photo,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      if (result.ok) {
        setSuccess(true);
        window.location.href = '/cafe-front/orders';
      } else {
        setError(result.error ?? 'Check-in failed.');
      }
    });
  };

  if (shiftGate.checkedInToday) {
    return (
      <ExecutiveGlassCard className="border-emerald-200/80 bg-emerald-50/50 p-6 text-center">
        <p className="text-sm font-bold text-emerald-900">Shift check-in complete</p>
        <p className="mt-2 text-xs text-emerald-800">
          Checked in at {shiftGate.checkinAt ? new Date(shiftGate.checkinAt).toLocaleTimeString() : 'today'}.
          You can accept customer orders.
        </p>
      </ExecutiveGlassCard>
    );
  }

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <h2 className="text-lg font-bold uppercase text-slate-800">Shift Check-in</h2>
        <p className="mt-1 text-xs text-slate-500">
          GPS + live selfie required before you can see or accept café orders.
        </p>
      </div>

      <div className="space-y-4 p-5">
        {!shiftGate.rosteredToday ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
            You are not rostered for a shift today. Contact your manager if this is incorrect.
          </p>
        ) : null}

        <button
          type="button"
          onClick={captureGps}
          className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-black uppercase text-sky-800"
        >
          <MapPin className="h-4 w-4" />
          {coords ? `GPS locked · ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Capture GPS location'}
        </button>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase text-slate-700"
          >
            <Camera className="h-4 w-4" />
            Take shift selfie
          </button>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Shift selfie" className="mt-3 max-h-48 rounded-xl border object-cover" />
          ) : null}
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            Check-in recorded — redirecting to orders…
          </p>
        ) : null}

        <button
          type="button"
          disabled={isPending || !shiftGate.rosteredToday}
          onClick={submit}
          className="w-full rounded-xl bg-orange-600 py-3 text-sm font-black uppercase tracking-wider text-white disabled:opacity-40"
        >
          {isPending ? 'Submitting…' : 'Start shift'}
        </button>
      </div>
    </ExecutiveGlassCard>
  );
}
