'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Upload, X } from 'lucide-react';

import { compressHrDocumentFileClient } from '../../../lib/hr-document-compress-client';
import {
  CAREERS_DOC_MAX_EDGE_PX,
  CAREERS_DOC_TARGET_MAX_BYTES,
  CAREERS_SELFIE_MAX_EDGE_PX,
  CAREERS_SELFIE_TARGET_MAX_BYTES,
} from '../../../lib/hr-document-compress';
import {
  OfficeCopyWatermarkOverlay,
} from '../../../lib/identity-document-watermark-client';
import { shouldApplyOfficeCopyWatermark } from '../../../lib/identity-document-watermark';
import { useSecurityWebsite } from '../components/SecurityWebsiteContext';
import { submitGuardJobApplication } from './actions';

type RankGap = {
  rank: string;
  needed: number;
};

type VacancyApplyModalProps = {
  open: boolean;
  onClose: () => void;
  siteId: string;
  siteLabel: string;
  rankGaps: RankGap[];
};

type DocField = 'idFront' | 'servicemenCert';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export default function VacancyApplyModal({
  open,
  onClose,
  siteId,
  siteLabel,
  rankGaps,
}: VacancyApplyModalProps) {
  const { careersUi } = useSecurityWebsite();
  const docLabels: Record<DocField, string> = {
    idFront: careersUi.careersNicFront,
    servicemenCert: careersUi.careersServicemenCert,
  };
  const [phonePrimary, setPhonePrimary] = useState('');
  const [phoneSecondary, setPhoneSecondary] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [docPreviews, setDocPreviews] = useState<Partial<Record<DocField, string>>>({});
  const [docFiles, setDocFiles] = useState<Partial<Record<DocField, string>>>({});
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const resetForm = useCallback(() => {
    setPhonePrimary('');
    setPhoneSecondary('');
    setWeightKg('');
    setHeightFt('');
    setDocPreviews({});
    setDocFiles({});
    setSelfiePreview(null);
    setSelfieBase64(null);
    setError(null);
    setSubmitted(false);
    stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const attachCameraStream = useCallback(async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      setError(careersUi.careersErrCamera);
      stopCamera();
    }
  }, [stopCamera, careersUi.careersErrCamera]);

  useEffect(() => {
    if (!cameraOn) return;
    const frame = requestAnimationFrame(() => {
      void attachCameraStream();
    });
    return () => cancelAnimationFrame(frame);
  }, [cameraOn, attachCameraStream]);

  const startCamera = async () => {
    setError(null);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setError(careersUi.careersErrCamera);
    }
  };

  const captureSelfie = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) return;

    const side = Math.min(sourceWidth, sourceHeight);
    const sx = (sourceWidth - side) / 2;
    const sy = (sourceHeight - side) / 2;

    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);

    const captureBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Could not capture selfie.'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        0.85,
      );
    });

    try {
      const compressed = await compressHrDocumentFileClient(
        new File([captureBlob], 'selfie.jpg', { type: 'image/jpeg' }),
        {
          targetMaxBytes: CAREERS_SELFIE_TARGET_MAX_BYTES,
          maxEdgePx: CAREERS_SELFIE_MAX_EDGE_PX,
          grayscale: false,
        },
      );
      const dataUrl = await fileToDataUrl(compressed.file);
      stopCamera();
      setSelfiePreview(dataUrl);
      setSelfieBase64(dataUrl);
    } catch {
      setError(careersUi.careersErrImage);
    }
  };

  const handleDocUpload = async (field: DocField, file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressHrDocumentFileClient(file, {
        officeCopyWatermark: shouldApplyOfficeCopyWatermark(
          field === 'idFront' ? 'id-front' : 'servicemen-cert',
        ),
        targetMaxBytes: CAREERS_DOC_TARGET_MAX_BYTES,
        maxEdgePx: CAREERS_DOC_MAX_EDGE_PX,
      });
      const dataUrl = await fileToDataUrl(compressed.file);
      setDocPreviews((prev) => ({ ...prev, [field]: compressed.previewUrl }));
      setDocFiles((prev) => ({ ...prev, [field]: dataUrl }));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : careersUi.careersErrImage,
      );
    }
  };

  const handleSubmitClick = async () => {
    if (busy) return;
    if (formRef.current && !formRef.current.reportValidity()) return;

    setError(null);

    if (!docFiles.idFront || !docFiles.servicemenCert) {
      setError(careersUi.careersErrDocs);
      return;
    }
    if (!selfieBase64) {
      setError(careersUi.careersErrSelfie);
      return;
    }

    setBusy(true);
    try {
      const result = await submitGuardJobApplication({
        siteProfileId: siteId,
        siteLabel,
        phonePrimary,
        phoneSecondary: phoneSecondary.trim() || undefined,
        weightKg: Number(weightKg),
        heightFt: Number(heightFt),
        idDocFrontBase64: docFiles.idFront,
        servicemenCertBase64: docFiles.servicemenCert,
        selfieBase64,
      });

      if (!result.success) {
        setError(result.error ?? careersUi.careersErrSubmit);
        return;
      }

      setSubmitted(true);
    } catch {
      setError(careersUi.careersErrSubmit);
    } finally {
      setBusy(false);
    }
  };

  const blockImplicitFormSubmit = (event: React.FormEvent | React.KeyboardEvent) => {
    event.preventDefault();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div
        className="absolute inset-0"
        aria-hidden
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">
              {careersUi.careersModalApply}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{siteLabel}</h2>
            {rankGaps.length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                {rankGaps.map((gap) => gap.rank).join(', ')}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={careersUi.careersClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {submitted ? (
          <div className="px-5 py-10 text-center">
            <p className="text-lg font-semibold text-emerald-800">{careersUi.careersSubmittedTitle}</p>
            <p className="mt-2 text-sm text-slate-600">{careersUi.careersSubmittedBody}</p>
            <button
              type="button"
              onClick={onClose}
              className="cv-btn-green mt-6 rounded-full px-6 py-2.5 text-sm font-bold"
            >
              {careersUi.careersDone}
            </button>
          </div>
        ) : (
          <form
            ref={formRef}
            onSubmit={blockImplicitFormSubmit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                    {careersUi.careersPhonePrimary}
                  </span>
                  <input
                    type="tel"
                    required
                    value={phonePrimary}
                    onChange={(e) => setPhonePrimary(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    placeholder={careersUi.careersPhonePlaceholder}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                    {careersUi.careersPhoneSecondary}
                  </span>
                  <input
                    type="tel"
                    value={phoneSecondary}
                    onChange={(e) => setPhoneSecondary(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    placeholder={careersUi.careersPhoneOptional}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                    {careersUi.careersWeightKg}
                  </span>
                  <input
                    type="number"
                    required
                    min={30}
                    max={250}
                    step={0.1}
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                    {careersUi.careersHeightFt}
                  </span>
                  <input
                    type="number"
                    required
                    min={4}
                    max={8.5}
                    step={0.1}
                    value={heightFt}
                    onChange={(e) => setHeightFt(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    placeholder={careersUi.careersHeightPlaceholder}
                  />
                </label>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {careersUi.careersIdentityDocs}
                </p>
                {(Object.keys(docLabels) as DocField[]).map((field) => (
                  <label
                    key={field}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 hover:border-red-200 hover:bg-red-50/40"
                  >
                    {docPreviews[field] ? (
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={docPreviews[field]}
                          alt=""
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                        {(field === 'idFront') ? (
                          <OfficeCopyWatermarkOverlay className="rounded-lg" />
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white text-slate-400">
                        <Upload className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{docLabels[field]}</p>
                      <p className="text-xs text-slate-500">{careersUi.careersTapUpload}</p>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        void handleDocUpload(field, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                ))}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {careersUi.careersLiveSelfie}
                </p>
                {selfiePreview ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="aspect-square w-40 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 sm:w-44">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selfiePreview}
                        alt="Selfie preview"
                        className="h-full w-full scale-x-[-1] object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelfiePreview(null);
                        setSelfieBase64(null);
                        void startCamera();
                      }}
                      className="text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline"
                    >
                      {careersUi.careersRetakeSelfie}
                    </button>
                  </div>
                ) : cameraOn ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="aspect-square w-40 overflow-hidden rounded-2xl border border-slate-200 bg-black sm:w-44">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-full w-full scale-x-[-1] object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void captureSelfie()}
                      aria-label={careersUi.careersCaptureSelfie}
                      className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-slate-200 bg-white text-slate-900 shadow-md transition-transform hover:scale-105 active:scale-95"
                    >
                      <Camera className="h-6 w-6" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-4 text-sm font-bold text-emerald-800"
                  >
                    <Camera className="h-4 w-4" />
                    {careersUi.careersOpenCamera}
                  </button>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => void handleSubmitClick()}
                disabled={busy}
                className="cv-btn-green flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {careersUi.careersSubmitting}
                  </>
                ) : (
                  careersUi.careersSubmit
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
