'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { Camera, Loader2, Move, X } from 'lucide-react';

import { uploadSecurityWebsiteSlotImage } from '../actions';
import type { SecurityWebsiteImageSlot } from '../../../lib/security-website-images';
import {
  formatObjectPosition,
  parseObjectPosition,
  type SecurityWebsiteImageFrame,
} from '../../../lib/security-website-image-frame';
import { compressSecurityWebsiteImageFile } from '../../../lib/security-website-image-compress-client';

type Props = {
  src: string;
  alt: string;
  slot: SecurityWebsiteImageSlot;
  editing: boolean;
  hasCustomImage?: boolean;
  onUploaded: (url: string) => void;
  frame: SecurityWebsiteImageFrame;
  defaultFrame: SecurityWebsiteImageFrame;
  onFrameChange?: (frame: SecurityWebsiteImageFrame) => void;
  className?: string;
  priority?: boolean;
  objectFit?: 'cover' | 'contain';
};

function frameStyle(
  frame: SecurityWebsiteImageFrame,
  objectFit: 'cover' | 'contain',
): CSSProperties {
  const scale = objectFit === 'contain' ? 1 : frame.scale;
  return {
    objectPosition: frame.objectPosition,
    transform: scale > 1 ? `scale(${scale})` : undefined,
    transformOrigin: frame.objectPosition,
  };
}

export default function SecurityEditableImage({
  src,
  alt,
  slot,
  editing,
  hasCustomImage = true,
  onUploaded,
  frame,
  defaultFrame,
  onFrameChange,
  className,
  priority,
  objectFit = 'cover',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const displaySrc = previewSrc ?? src;
  const effectiveFrame = frame ?? defaultFrame;
  const imageClass =
    objectFit === 'contain'
      ? 'object-contain'
      : `object-cover ${effectiveFrame.scale <= 1 ? 'scale-[1.03]' : ''}`;

  useEffect(() => {
    if (!editing) setAdjusting(false);
  }, [editing]);

  const emitFrame = useCallback(
    (next: SecurityWebsiteImageFrame) => {
      onFrameChange?.(next);
    },
    [onFrameChange],
  );

  const handleFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    setUploadError(null);
    try {
      const dataUrl = await compressSecurityWebsiteImageFile(file);
      setPreviewSrc(dataUrl);
      const result = await uploadSecurityWebsiteSlotImage(slot, dataUrl);
      if (result.success && result.url) {
        onUploaded(result.url);
        emitFrame(defaultFrame);
        setAdjusting(true);
      } else {
        setUploadError(result.error ?? 'Upload failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(
        message.includes('Body exceeded')
          ? 'Image is too large. Try a smaller photo.'
          : message || 'Upload failed',
      );
    } finally {
      setPreviewSrc(null);
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!adjusting || !onFrameChange) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, a, label, [data-no-drag]')) return;
    event.preventDefault();
    const { x, y } = parseObjectPosition(effectiveFrame.objectPosition);
    dragRef.current = { x: event.clientX, y: event.clientY, originX: x, originY: y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !onFrameChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const deltaX = ((event.clientX - drag.x) / rect.width) * 100;
    const deltaY = ((event.clientY - drag.y) / rect.height) * 100;
    emitFrame({
      objectPosition: formatObjectPosition(drag.originX - deltaX, drag.originY - deltaY),
      scale: effectiveFrame.scale,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const showPersistentUpload = editing && !hasCustomImage && !adjusting;

  return (
    <div className={`group relative h-full w-full overflow-hidden ${className ?? ''}`}>
      <Image
        key={displaySrc}
        src={displaySrc}
        alt={alt}
        fill
        priority={priority}
        draggable={false}
        className={imageClass}
        style={frameStyle(effectiveFrame, objectFit)}
        sizes="(max-width: 768px) 100vw, 50vw"
        unoptimized={
          displaySrc.startsWith('data:') || displaySrc.includes('supabase')
        }
      />

      {editing && adjusting ? (
        <div
          className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="absolute inset-x-0 bottom-0 space-y-2 bg-slate-950/80 p-2.5 backdrop-blur-sm"
            data-no-drag
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/80">
                Zoom
              </span>
              <input
                type="range"
                min={100}
                max={250}
                step={1}
                value={Math.round(effectiveFrame.scale * 100)}
                onChange={(e) =>
                  emitFrame({
                    ...effectiveFrame,
                    scale: Number(e.target.value) / 100,
                  })
                }
                className="h-1.5 flex-1 accent-amber-400"
              />
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setAdjusting(false);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-900"
              >
                <X className="h-3 w-3" />
                Done
              </button>
            </div>
            <p className="text-center text-[10px] text-white/70">Drag to reposition</p>
          </div>
        </div>
      ) : null}

      {editing && !adjusting ? (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-end gap-2 bg-slate-950/45 p-2 transition-opacity ${
            showPersistentUpload ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {uploadError ? (
            <p className="rounded bg-rose-600/90 px-2 py-1 text-[10px] font-semibold text-white">
              {uploadError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-900 disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
              {hasCustomImage ? 'Replace' : 'Upload'}
            </button>
            {hasCustomImage && onFrameChange ? (
              <button
                type="button"
                onClick={() => setAdjusting(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/40 bg-slate-900/70 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white"
              >
                <Move className="h-3.5 w-3.5" />
                Move &amp; crop
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
