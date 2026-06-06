'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Check, CheckCircle2, ChevronDown, Gavel, RefreshCw } from 'lucide-react';
import type { PenaltyCatalogEntry } from '../../../../../packages/penalty-catalog';
import type { SMAssignmentOption } from '../../../lib/sm-assignments';
import { issuePenaltyAction } from './actions';

const selectClassName =
  'w-full bg-white border-2 border-slate-200 text-slate-900 px-4 py-3 rounded-xl font-mono focus:outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all appearance-none';

function guardNameFromLabel(label: string): string {
  const sep = label.indexOf(' — ');
  return sep >= 0 ? label.slice(sep + 3).trim() : '';
}

function formatOffenseSummary(offenses: PenaltyCatalogEntry[]): string {
  if (offenses.length === 1) return offenses[0].offense;
  if (offenses.length <= 3) return offenses.map((o) => o.offense).join(' · ');
  const head = offenses
    .slice(0, 2)
    .map((o) => o.offense)
    .join(' · ');
  return `${head} · +${offenses.length - 2} more`;
}

function compositeConsentSelfie(
  video: HTMLVideoElement,
  offenses: PenaltyCatalogEntry[],
  amount: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const barTop = canvas.height * 0.62;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, barTop, canvas.width, canvas.height - barTop);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ef4444';
  ctx.font = `bold ${Math.max(18, Math.round(canvas.width * 0.045))}px sans-serif`;
  ctx.fillText('DISCIPLINARY VIOLATION', canvas.width / 2, barTop + canvas.height * 0.08);

  ctx.font = `bold ${Math.max(16, Math.round(canvas.width * 0.038))}px sans-serif`;
  const offenseLines = wrapText(ctx, formatOffenseSummary(offenses).toUpperCase(), canvas.width * 0.9);
  offenseLines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, barTop + canvas.height * 0.16 + i * (canvas.height * 0.06));
  });

  ctx.font = `bold ${Math.max(20, Math.round(canvas.width * 0.05))}px sans-serif`;
  ctx.fillText(
    `DEDUCTION: LKR ${amount.toLocaleString()}`,
    canvas.width / 2,
    barTop + canvas.height * 0.34,
  );

  ctx.font = `${Math.max(12, Math.round(canvas.width * 0.028))}px sans-serif`;
  ctx.fillStyle = '#fca5a5';
  ctx.fillText('Guard consent recorded on camera', canvas.width / 2, barTop + canvas.height * 0.46);

  return canvas.toDataURL('image/jpeg', 0.88);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function ConsentOverlay({
  offenses,
  amount,
  onAccept,
}: {
  offenses: PenaltyCatalogEntry[];
  amount: number;
  onAccept: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-red-500/35 bg-black/20 backdrop-blur-[2px] px-5 py-5 space-y-3 text-center shadow-[0_0_40px_rgba(239,68,68,0.15)]">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-red-500">
          {offenses.length === 1 ? 'Deduction' : 'Total deduction'}
        </p>
        {offenses.length === 1 ? (
          <p className="text-red-500 font-black text-sm uppercase leading-snug">{offenses[0].offense}</p>
        ) : (
          <ul className="space-y-1.5 text-left border-b border-red-500/25 pb-3">
            {offenses.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3">
                <span className="text-red-500 font-bold text-sm uppercase leading-snug">{entry.offense}</span>
                <span className="text-red-500 font-black text-sm tabular-nums whitespace-nowrap">
                  LKR {entry.fine.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-red-500 font-black text-3xl tabular-nums leading-none">LKR {amount.toLocaleString()}</p>
        <p className="text-red-600/90 text-xs uppercase tracking-wide">
          Guard must read and accept on camera
        </p>
        <button
          type="button"
          onClick={onAccept}
          className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-red-600/30 active:scale-[0.98] transition-all"
        >
          Accept
        </button>
      </div>
    </div>
  );
}

export default function IssuePenaltyClient({
  catalog,
  guards,
}: {
  catalog: PenaltyCatalogEntry[];
  guards: SMAssignmentOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState<{ guardName: string; offense: string; amount: number } | null>(null);

  const [guardEpf, setGuardEpf] = useState('');
  const [guardName, setGuardName] = useState('');
  const [selectedOffenseIds, setSelectedOffenseIds] = useState<string[]>([]);

  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [consentPhoto, setConsentPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedOffenses = catalog.filter((entry) => selectedOffenseIds.includes(entry.id));
  const totalFine = selectedOffenses.reduce((sum, entry) => sum + entry.fine, 0);

  const closeCameraModal = useCallback(() => {
    setCameraModalOpen(false);
    setCameraReady(false);
  }, []);

  const stopCamera = useCallback(() => {
    const video = videoRef.current;
    if (video?.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
    closeCameraModal();
  }, [closeCameraModal]);

  const toggleOffense = useCallback(
    (id: string) => {
      setSelectedOffenseIds((prev) =>
        prev.includes(id) ? prev.filter((entryId) => entryId !== id) : [...prev, id],
      );
      setConsentPhoto(null);
      stopCamera();
    },
    [stopCamera],
  );

  useEffect(() => () => stopCamera(), [stopCamera]);

  const openCameraModal = useCallback(() => {
    setCameraError('');
    setConsentPhoto(null);
    setCameraReady(false);
    setCameraModalOpen(true);
  }, []);

  useEffect(() => {
    if (!cameraModalOpen) return;

    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setCameraReady(true);
      } catch {
        if (!cancelled) {
          setCameraError('Camera access denied. Please allow camera access for guard consent.');
          setCameraModalOpen(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      const video = videoRef.current;
      if (video?.srcObject) video.srcObject = null;
      setCameraReady(false);
    };
  }, [cameraModalOpen]);

  const captureConsent = useCallback(() => {
    const video = videoRef.current;
    if (!video || selectedOffenses.length === 0) return;

    const dataUrl = compositeConsentSelfie(video, selectedOffenses, totalFine);
    if (!dataUrl) {
      setCameraError('Failed to capture consent photo. Please try again.');
      return;
    }

    stopCamera();
    setConsentPhoto(dataUrl);
  }, [selectedOffenses, totalFine, stopCamera]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (selectedOffenses.length === 0) {
      setErrorMsg('Please select at least one disciplinary offense.');
      return;
    }
    if (!consentPhoto) {
      setErrorMsg('Guard consent selfie is required.');
      return;
    }

    const fd = new FormData();
    fd.set('guard_epf', guardEpf.trim().toUpperCase());
    fd.set('guard_name', guardName.trim());
    for (const offense of selectedOffenses) {
      fd.append('penalty_catalog_id', offense.id);
    }
    fd.set('consent_selfie', consentPhoto);

    startTransition(async () => {
      const result = await issuePenaltyAction(fd);
      if (result?.error) {
        setErrorMsg(result.error);
      } else if (result?.success) {
        setDone({
          guardName: result.guardName ?? (guardName || guardEpf),
          offense: result.offense ?? formatOffenseSummary(selectedOffenses),
          amount: result.amount ?? totalFine,
        });
      }
    });
  };

  const canCapture = Boolean(guardEpf && selectedOffenses.length > 0);
  const canSubmit = canCapture && Boolean(consentPhoto);

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="h-20 w-20 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-rose-600" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Penalty Issued</h2>
          <p className="text-sm text-slate-500">
            <span className="text-slate-700 font-bold">{done.guardName}</span>
            {' — '}
            <span className="text-red-600 font-bold">{done.offense}</span>
          </p>
          <p className="text-red-600 font-black text-lg tabular-nums">
            LKR {done.amount.toLocaleString()}
          </p>
          <p className="text-sm text-slate-400">Submitted with guard consent selfie for approval.</p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full max-w-xs bg-rose-500 hover:bg-rose-400 text-white font-black py-4 rounded-xl uppercase tracking-widest transition-all active:scale-95"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-5 space-y-6">
      <header className="flex items-center gap-3 pt-2">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Issue Penalty</h1>
          <p className="text-sm text-slate-500 font-mono">Guard disciplinary action</p>
        </div>
        <div className="ml-auto p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
          <Gavel className="w-5 h-5 text-rose-600" />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Guard Details</h2>
          <div>
            <label className="block text-sm font-bold text-slate-600 uppercase mb-2 tracking-wider">
              Guard <span className="text-rose-500">*</span>
            </label>
            {guards.length === 0 ? (
              <p className="text-sm text-amber-600/90 font-mono bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                No guards are assigned to your sites yet. Contact operations to assign guards before issuing a penalty.
              </p>
            ) : (
              <div className="relative">
                <select
                  required
                  value={guardEpf}
                  onChange={(e) => {
                    const epf = e.target.value;
                    setGuardEpf(epf);
                    const label = guards.find((g) => g.value === epf)?.label ?? '';
                    setGuardName(guardNameFromLabel(label));
                    setConsentPhoto(null);
                    stopCamera();
                  }}
                  className={`${selectClassName} pr-11 ${guardEpf ? 'text-slate-900' : 'text-slate-400'}`}
                >
                  <option value="" disabled>
                    Select a guard
                  </option>
                  {guards.map((guard) => (
                    <option key={guard.value} value={guard.value}>
                      {guard.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            )}
          </div>
          {guardName && (
            <p className="text-sm text-slate-500 font-mono">
              Selected: <span className="text-slate-700 font-bold">{guardName}</span>
            </p>
          )}
        </div>

        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">
              Disciplinary Offense <span className="text-rose-500">*</span>
            </h2>
            <span className="text-sm font-mono text-slate-500 uppercase">MD catalog</span>
          </div>
          <p className="text-sm text-slate-500">Tap to select one or more offenses.</p>
          <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
            {catalog.map((entry) => {
              const isSelected = selectedOffenseIds.includes(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => toggleOffense(entry.id)}
                  className={`p-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'bg-rose-500/15 border-rose-500/50'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        isSelected
                          ? 'border-rose-500 bg-rose-500 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <span
                        className={`text-xs font-bold leading-snug ${
                          isSelected ? 'text-rose-300' : 'text-slate-700'
                        }`}
                      >
                        {entry.offense}
                      </span>
                      <span
                        className={`text-xs font-black tabular-nums whitespace-nowrap ${
                          isSelected ? 'text-red-600' : 'text-slate-500'
                        }`}
                      >
                        LKR {entry.fine.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {selectedOffenses.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 space-y-2">
              <p className="text-sm font-black uppercase tracking-widest text-red-600 text-center">
                {selectedOffenses.length === 1 ? 'Auto-calculated deduction' : 'Total deduction'}
              </p>
              {selectedOffenses.length > 1 && (
                <ul className="space-y-1 border-b border-red-500/20 pb-2">
                  {selectedOffenses.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-red-300/90 font-semibold leading-snug">{entry.offense}</span>
                      <span className="text-red-600/80 font-black tabular-nums whitespace-nowrap">
                        LKR {entry.fine.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-red-600 font-black text-2xl tabular-nums text-center">
                LKR {totalFine.toLocaleString()}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">
              Guard Consent Selfie <span className="text-rose-500">*</span>
            </h2>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              Show the guard the violation and deduction amount on screen. Capture a selfie so consent is legally recorded.
            </p>
          </div>

          {!canCapture && (
            <p className="text-sm text-slate-500 text-center py-4">
              Select a guard and at least one offense before capturing consent.
            </p>
          )}

          {canCapture && !consentPhoto && (
            <button
              type="button"
              onClick={openCameraModal}
              className="w-full flex items-center justify-center gap-2 bg-white border-2 border-dashed border-slate-300 text-slate-700 font-bold py-4 rounded-xl hover:border-rose-500/50 hover:text-rose-300 transition-all"
            >
              <Camera className="w-5 h-5" />
              Open Camera for Guard Consent
            </button>
          )}

          <canvas ref={canvasRef} className="hidden" />

          {consentPhoto && selectedOffenses.length > 0 && (
            <div className="space-y-3">
              <div className="relative w-full aspect-[3/4] max-h-96 rounded-2xl overflow-hidden border-2 border-emerald-500/30 mx-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={consentPhoto} alt="Guard consent selfie" className="object-cover w-full h-full" />
              </div>
              <button
                type="button"
                onClick={() => {
                  setConsentPhoto(null);
                  openCameraModal();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm uppercase tracking-wide hover:text-slate-800"
              >
                <RefreshCw className="w-4 h-4" />
                Retake Selfie
              </button>
            </div>
          )}

          {cameraError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-sm text-center font-bold">
              {cameraError}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-sm text-center font-bold">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || !canSubmit || guards.length === 0}
          className="w-full bg-rose-500 hover:bg-rose-400 text-white font-black py-4 rounded-xl uppercase tracking-widest text-base shadow-[0_8px_20px_rgba(244,63,94,0.25)] transition-all active:scale-95 disabled:opacity-40"
        >
          {isPending ? 'Issuing...' : 'Issue Penalty'}
        </button>
      </form>

      {cameraModalOpen && selectedOffenses.length > 0 && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-label="Guard consent camera"
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover scale-x-[-1]"
          />

          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <p className="text-slate-600 text-sm font-bold uppercase tracking-widest animate-pulse">
                Starting camera…
              </p>
            </div>
          )}

          {cameraReady && (
            <ConsentOverlay offenses={selectedOffenses} amount={totalFine} onAccept={captureConsent} />
          )}

          <button
            type="button"
            onClick={stopCamera}
            className="absolute top-4 left-4 z-10 rounded-xl border border-white/20 bg-black/50 px-4 py-2 text-sm font-bold uppercase tracking-wide text-slate-800 backdrop-blur-sm"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
