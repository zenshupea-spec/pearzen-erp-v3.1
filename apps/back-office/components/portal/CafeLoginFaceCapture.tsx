'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';

type FaceStage = 'camera' | 'preview';

function captureFrameWithTimestamp(video: HTMLVideoElement): string | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const stamp = new Date().toLocaleString('en-LK', {
    timeZone: 'Asia/Colombo',
    hour12: false,
  });
  ctx.font = 'bold 16px ui-monospace, monospace';
  const metrics = ctx.measureText(stamp);
  const padX = 10;
  const boxW = metrics.width + padX * 2;
  const boxH = 28;
  const boxY = canvas.height - boxH - 12;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(12, boxY, boxW, boxH);
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(stamp, 12 + padX, boxY + 20);

  return canvas.toDataURL('image/jpeg', 0.88);
}

export default function CafeLoginFaceCapture({
  onConfirm,
  onBack,
  isSubmitting = false,
  errorMsg,
}: {
  onConfirm: (dataUrl: string) => void;
  onBack: () => void;
  isSubmitting?: boolean;
  errorMsg?: string;
}) {
  const [stage, setStage] = useState<FaceStage>('camera');
  const [localError, setLocalError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);
  const cameraRequestIdRef = useRef(0);

  const stopCamera = useCallback(() => {
    cameraRequestIdRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActiveStream(null);
    setCameraReady(false);

    const video = videoRef.current;
    if (video?.srcObject) {
      const attached = video.srcObject as MediaStream;
      attached.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  }, []);

  const openCamera = useCallback(async () => {
    setLocalError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setLocalError('Camera is not supported on this device or browser.');
      return;
    }

    stopCamera();
    const requestId = cameraRequestIdRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      if (!activeRef.current || requestId !== cameraRequestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraReady(false);
      setActiveStream(stream);
      setStage('camera');
    } catch {
      if (!activeRef.current || requestId !== cameraRequestIdRef.current) return;
      setLocalError('Camera permission denied. Allow camera access and try again.');
    }
  }, [stopCamera]);

  useEffect(() => {
    activeRef.current = true;
    void openCamera();

    const handleHide = () => {
      activeRef.current = false;
      stopCamera();
    };

    window.addEventListener('pagehide', handleHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handleHide();
    });

    return () => {
      activeRef.current = false;
      stopCamera();
      window.removeEventListener('pagehide', handleHide);
    };
  }, [openCamera, stopCamera]);

  useEffect(() => {
    if (stage !== 'camera' || !activeStream) return;
    const video = videoRef.current;
    if (!video) return;

    const requestId = cameraRequestIdRef.current;
    video.srcObject = activeStream;

    const markReady = () => {
      if (requestId !== cameraRequestIdRef.current) return;
      setCameraReady(true);
    };

    video.addEventListener('loadeddata', markReady);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) markReady();
    void video.play().catch(() => {});

    return () => {
      video.removeEventListener('loadeddata', markReady);
      if (video.srcObject) video.srcObject = null;
    };
  }, [stage, activeStream]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const dataUrl = captureFrameWithTimestamp(video);
    if (!dataUrl) {
      setLocalError('Camera feed not ready. Wait a moment and try again.');
      return;
    }
    stopCamera();
    setPreviewUrl(dataUrl);
    setStage('preview');
  };

  const retake = async () => {
    setPreviewUrl(null);
    setLocalError('');
    activeRef.current = true;
    await openCamera();
  };

  const displayError = errorMsg || localError;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-orange-100 bg-orange-50/90 px-3 py-2.5 text-center text-[11px] font-semibold leading-relaxed text-orange-950">
        Live face snapshot required before you enter the café desk. A timestamp is burned into
        the photo. You will take another selfie at site check-in.
      </div>

      {stage === 'camera' ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-[3/4] w-full scale-x-[-1] object-cover"
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Captured face" className="aspect-[3/4] w-full object-cover" />
          ) : null}
        </div>
      )}

      {displayError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
          {displayError}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {stage === 'camera' ? (
          <button
            type="button"
            onClick={capture}
            disabled={isSubmitting || !cameraReady}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {cameraReady ? 'Capture face' : 'Starting camera…'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => previewUrl && onConfirm(previewUrl)}
              disabled={isSubmitting || !previewUrl}
              className="w-full rounded-xl bg-emerald-600 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md disabled:opacity-50"
            >
              {isSubmitting ? 'Signing in…' : 'Confirm & sign in'}
            </button>
            <button
              type="button"
              onClick={() => void retake()}
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-xs font-black uppercase tracking-wider text-slate-600"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retake
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="w-full rounded-xl border border-slate-200 py-3 text-xs font-bold uppercase tracking-wider text-slate-500"
        >
          Back to credentials
        </button>
      </div>
    </div>
  );
}
