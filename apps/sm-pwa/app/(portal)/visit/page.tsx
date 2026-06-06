'use client'

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Camera, RotateCcw, MapPin, AlertCircle, ArrowLeft, Shield } from 'lucide-react';
import { logVisitAction } from './actions';

type Stage = 'opening' | 'camera' | 'preview' | 'submitting' | 'done' | 'error';

function LogVisitInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qrSite = searchParams.get('site'); // populated when SM scans a site QR code

  const [stage, setStage] = useState<Stage>('opening');
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successSite, setSuccessSite] = useState('');
  const [alreadyLoggedSite, setAlreadyLoggedSite] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Tracks whether the component is still alive so async getUserMedia callbacks
  // can bail out rather than assigning a zombie stream after unmount / bfcache restore.
  const activeRef = useRef(false);
  // Bumps on every stop/unmount so stale getUserMedia resolutions cannot attach a stream.
  const cameraRequestIdRef = useRef(0);

  const stopCamera = () => {
    cameraRequestIdRef.current += 1;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    const video = videoRef.current;
    if (video?.srcObject) {
      const attached = video.srcObject as MediaStream;
      attached.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  };

  const openCamera = async () => {
    setErrorMsg('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Camera is not supported on this device or browser.');
      setStage('error');
      return;
    }

    stopCamera();
    const requestId = cameraRequestIdRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      // Component may have unmounted, navigated away, or started a newer request
      // while getUserMedia was pending — stop the stream immediately.
      if (!activeRef.current || requestId !== cameraRequestIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setStage('camera');
    } catch {
      if (!activeRef.current || requestId !== cameraRequestIdRef.current) return;
      setErrorMsg('Camera permission denied. Please allow camera access and try again.');
      setStage('error');
    }
  };

  // Auto-open camera on mount; stop it on every possible exit path including
  // bfcache freezes (pagehide) and tab-switch (visibilitychange).
  useEffect(() => {
    activeRef.current = true;
    openCamera();

    const handleHide = () => {
      activeRef.current = false;
      stopCamera();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') handleHide();
    };

    // pagehide fires before bfcache freeze AND before unload.
    // visibilitychange fires when the tab/app is backgrounded on mobile.
    window.addEventListener('pagehide', handleHide);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      activeRef.current = false;
      stopCamera();
      window.removeEventListener('pagehide', handleHide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach stream to video element when camera stage is active; detach on exit.
  useEffect(() => {
    if (stage !== 'camera') {
      const video = videoRef.current;
      if (video?.srcObject) video.srcObject = null;
      return;
    }
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream) {
      video.srcObject = stream;
    }
    return () => {
      if (video?.srcObject) video.srcObject = null;
    };
  }, [stage]);

  // Redirect to dashboard after success
  useEffect(() => {
    if (stage === 'done') {
      const t = setTimeout(() => router.push('/dashboard'), 2000);
      return () => clearTimeout(t);
    }
  }, [stage, router]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorMsg('Camera feed not ready. Please wait a moment and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopCamera();
    setCapturedDataUrl(dataUrl);
    setStage('preview');
  };

  const goBack = () => {
    activeRef.current = false;
    stopCamera();
    router.back();
  };

  const retake = async () => {
    setErrorMsg('');
    setCapturedDataUrl(null);
    activeRef.current = true;
    await openCamera();
  };

  const submit = async (force = false) => {
    setStage('submitting');
    setErrorMsg('');

    if (!navigator.geolocation) {
      setErrorMsg('GPS is not supported on this device.');
      setStage('preview');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const fd = new FormData();
        fd.set('latitude', String(pos.coords.latitude));
        fd.set('longitude', String(pos.coords.longitude));
        fd.set('gps_accuracy', String(pos.coords.accuracy));
        fd.set('selfie_confirmed', 'true');
        fd.set('visit_confirmation', 'on');
        if (capturedDataUrl) fd.set('selfie_photo', capturedDataUrl);
        if (qrSite) fd.set('site_name', qrSite);
        if (force) fd.set('force_log', 'true');

        const result = await logVisitAction(fd);

        if ('already_logged' in result && result.already_logged) {
          setAlreadyLoggedSite(result.site);
          setStage('preview');
        } else if ('error' in result) {
          setErrorMsg(result.error);
          setStage('preview');
        } else if ('success' in result && result.success) {
          setSuccessSite(result.site);
          setStage('done');
        }
      },
      () => {
        setErrorMsg('Could not get GPS location. Enable location access and try again.');
        setStage('preview');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  /* ── Success ── */
  if (stage === 'done') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 min-h-[100dvh]">
        <div className="h-24 w-24 rounded-full bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-amber-600" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Visit Logged</h2>
          {successSite && (
            <div className="flex items-center justify-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              <p className="text-sm text-amber-600 font-bold">{successSite}</p>
            </div>
          )}
          <p className="text-sm text-slate-400 font-mono mt-2">Returning to dashboard…</p>
        </div>
      </div>
    );
  }

  /* ── Submitting ── */
  if (stage === 'submitting') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 min-h-[100dvh]">
        <svg className="w-10 h-10 text-amber-600 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p className="text-sm font-bold text-slate-600 uppercase tracking-widest">Getting GPS…</p>
      </div>
    );
  }

  /* ── Camera error / permission denied ── */
  if (stage === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 min-h-[100dvh]">
        <button
          onClick={goBack}
          className="absolute top-5 left-5 p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="h-20 w-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <Camera className="w-9 h-9 text-red-600" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Camera Unavailable</h2>
          <p className="text-sm text-slate-500 max-w-xs">{errorMsg}</p>
        </div>
        <button
          onClick={openCamera}
          className="bg-amber-500 hover:bg-amber-400 text-stone-900 font-black py-3 px-8 rounded-xl uppercase tracking-widest text-sm transition-all active:scale-95"
        >
          Try Again
        </button>
      </div>
    );
  }

  /* ── Preview + Declaration ── */
  if (stage === 'preview' && capturedDataUrl) {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-stone-950">
        {/* Back button */}
        <button
          onClick={goBack}
          className="absolute top-4 left-4 z-10 p-2 rounded-xl bg-white/80 border border-slate-200 text-slate-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Captured photo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={capturedDataUrl}
          alt="Captured selfie"
          className="w-full flex-1 object-cover"
          style={{ maxHeight: '55dvh' }}
        />

        {/* Bottom sheet */}
        <div className="bg-white border-t border-slate-200/60 p-5 space-y-5 rounded-t-3xl -mt-6 relative">

          {/* Declaration */}
          <div className="flex items-start gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
            <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700 leading-relaxed">
              I confirm that I have personally checked this site.
            </p>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-4">
            {/* Retake */}
            <button
              onClick={retake}
              className="flex flex-col items-center gap-1.5 p-4 rounded-2xl border border-slate-200 bg-slate-100 text-slate-600 hover:text-slate-800 hover:border-slate-300 transition-all active:scale-95 flex-1"
            >
              <RotateCcw className="w-6 h-6" />
              <span className="text-sm font-black uppercase tracking-widest">Retake</span>
            </button>

            {/* Confirm — big round button */}
            <button
              onClick={() => submit(false)}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="w-20 h-20 rounded-full bg-amber-500 hover:bg-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/30 transition-all active:scale-95">
                <CheckCircle2 className="w-9 h-9 text-stone-900" />
              </div>
              <span className="text-sm font-black text-amber-600 uppercase tracking-widest">Confirm</span>
            </button>
          </div>
        </div>

        {/* Already logged modal */}
        {alreadyLoggedSite && (
          <div className="fixed inset-0 z-50 bg-stone-950/90 backdrop-blur-sm flex items-end justify-center p-4 pb-8">
            <div className="w-full max-w-sm rounded-2xl border border-amber-500/30 bg-white p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Already Logged Today</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{alreadyLoggedSite}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                You have already logged a visit for <span className="text-slate-800 font-bold">{alreadyLoggedSite}</span> today. Do you want to log another visit?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setAlreadyLoggedSite(null); goBack(); }}
                  className="rounded-xl border border-slate-300 px-3 py-3 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  No, Go Back
                </button>
                <button
                  onClick={() => { setAlreadyLoggedSite(null); submit(true); }}
                  className="rounded-xl border border-amber-400/70 px-3 py-3 text-xs font-bold text-stone-900 bg-amber-400 hover:bg-amber-300 transition-all active:scale-95"
                >
                  Yes, Log Again
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Camera opening / live feed ── */
  return (
    <div className="flex flex-col min-h-[100dvh] bg-stone-950 relative">
      {/* Back */}
      <button
        onClick={goBack}
        className="absolute top-4 left-4 z-10 p-2 rounded-xl bg-white/80 border border-slate-200 text-slate-600"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      {/* Label */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <span className="text-xs font-black text-slate-600 uppercase tracking-[0.2em]">Log Visit</span>
      </div>

      {/* Live camera feed */}
      {stage === 'opening' ? (
        <div className="flex-1 flex items-center justify-center">
          <svg className="w-8 h-8 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="flex-1 w-full object-cover bg-stone-950"
        />
      )}

      {/* Capture button */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-12 pt-6 bg-gradient-to-t from-stone-950 via-stone-950/60 to-transparent">
        <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mb-5">
          {qrSite ? `Site: ${qrSite}` : 'Site auto-detected by GPS'}
        </p>
        <button
          onClick={capture}
          disabled={stage !== 'camera'}
          className="w-20 h-20 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 flex items-center justify-center shadow-xl shadow-amber-500/30 transition-all active:scale-95 border-4 border-stone-950"
        >
          <Camera className="w-8 h-8 text-stone-900" />
        </button>
        <p className="text-sm text-slate-400 font-mono mt-4">Tap to take selfie</p>
      </div>
    </div>
  );
}

export default function LogVisitPage() {
  return (
    <Suspense>
      <LogVisitInner />
    </Suspense>
  );
}
