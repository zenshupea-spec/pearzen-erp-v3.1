'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { Camera, Loader2, Move, Trash2, X } from 'lucide-react';

import { compressSecurityWebsiteImageFile } from '../../../lib/security-website-image-compress-client';
import {
  formatObjectPosition,
  parseObjectPosition,
} from '../../../lib/security-website-image-frame';
import {
  DEFAULT_CAFE_MENU_ITEM_IMAGE_FRAME,
  type CafeMenuItemImageFrame,
} from './cafe-menu-item-image';

function frameStyle(frame: CafeMenuItemImageFrame): CSSProperties {
  const scale = frame.scale;
  return {
    objectPosition: frame.objectPosition,
    transform: scale > 1 ? `scale(${scale})` : undefined,
    transformOrigin: frame.objectPosition,
  };
}

type CafeMenuItemImageEditorProps = {
  imageUrl: string | null;
  frame: CafeMenuItemImageFrame;
  onChange: (next: { imageUrl: string | null; frame: CafeMenuItemImageFrame }) => void;
  size: 'sm' | 'lg';
  placeholderGradient?: string;
  className?: string;
};

export function CafeMenuItemImagePreview({
  imageUrl,
  frame,
  size,
  placeholderGradient,
  className = '',
}: Pick<CafeMenuItemImageEditorProps, 'imageUrl' | 'frame' | 'size' | 'placeholderGradient' | 'className'>) {
  const cls =
    size === 'sm'
      ? 'h-11 w-11 rounded-xl flex-shrink-0'
      : 'h-32 w-full rounded-2xl';

  return (
    <div
      className={`relative overflow-hidden ${cls} ${className}`}
      style={
        placeholderGradient && !imageUrl
          ? { background: placeholderGradient }
          : { background: placeholderGradient ?? '#e2e8f0' }
      }
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          draggable={false}
          className="object-cover"
          style={frameStyle(frame)}
          sizes={size === 'sm' ? '44px' : '320px'}
          unoptimized={imageUrl.startsWith('data:') || imageUrl.includes('supabase')}
        />
      ) : null}
    </div>
  );
}

export default function CafeMenuItemImageEditor({
  imageUrl,
  frame,
  onChange,
  size,
  placeholderGradient,
  className = '',
}: CafeMenuItemImageEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const displaySrc = previewSrc ?? imageUrl;
  const effectiveFrame = frame ?? DEFAULT_CAFE_MENU_ITEM_IMAGE_FRAME;

  useEffect(() => {
    if (!displaySrc) setAdjusting(false);
  }, [displaySrc]);

  const emitFrame = useCallback(
    (next: CafeMenuItemImageFrame) => {
      onChange({ imageUrl, frame: next });
    },
    [imageUrl, onChange],
  );

  const handleFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    setUploadError(null);
    try {
      const dataUrl = await compressSecurityWebsiteImageFile(file);
      onChange({ imageUrl: dataUrl, frame: DEFAULT_CAFE_MENU_ITEM_IMAGE_FRAME });
      setAdjusting(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(message.includes('Body exceeded') ? 'Image is too large.' : message);
    } finally {
      setPreviewSrc(null);
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!adjusting || !displaySrc) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, a, label, [data-no-drag]')) return;
    event.preventDefault();
    const { x, y } = parseObjectPosition(effectiveFrame.objectPosition);
    dragRef.current = { x: event.clientX, y: event.clientY, originX: x, originY: y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
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

  const cls =
    size === 'sm'
      ? 'h-11 w-11 rounded-xl flex-shrink-0'
      : 'h-32 w-full rounded-2xl';

  return (
    <div className={`group relative overflow-hidden ${cls} ${className}`}>
      <div
        className="absolute inset-0"
        style={
          placeholderGradient && !displaySrc
            ? { background: placeholderGradient }
            : { background: placeholderGradient ?? '#e2e8f0' }
        }
      />

      {displaySrc ? (
        <Image
          key={displaySrc}
          src={displaySrc}
          alt=""
          fill
          draggable={false}
          className={`object-cover ${effectiveFrame.scale <= 1 ? 'scale-[1.03]' : ''}`}
          style={frameStyle(effectiveFrame)}
          sizes={size === 'sm' ? '44px' : '320px'}
          unoptimized={displaySrc.startsWith('data:') || displaySrc.includes('supabase')}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 opacity-70">
          <Camera className="h-3.5 w-3.5 text-white drop-shadow" />
          <span className="text-[8px] font-black uppercase tracking-widest text-white drop-shadow">
            Upload
          </span>
        </div>
      )}

      {adjusting && displaySrc ? (
        <div
          className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="absolute inset-x-0 bottom-0 space-y-1 bg-slate-950/85 p-1.5 backdrop-blur-sm"
            data-no-drag
            onPointerDown={(event) => event.stopPropagation()}
          >
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
              className="h-1 w-full accent-amber-400"
              aria-label="Zoom image"
            />
            <div className="flex items-center justify-between gap-1">
              <span className="text-[8px] font-semibold uppercase tracking-wide text-white/75">
                Drag · zoom
              </span>
              <button
                type="button"
                onClick={() => setAdjusting(false)}
                className="rounded bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase text-slate-900"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-end gap-1 bg-slate-950/45 p-1 transition-opacity ${
            displaySrc ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
          }`}
        >
          {uploadError ? (
            <p className="rounded bg-rose-600/90 px-1 py-0.5 text-[8px] font-semibold text-white">
              {uploadError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-1 text-[8px] font-bold uppercase text-slate-900 disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Camera className="h-3 w-3" />
              )}
              {displaySrc ? 'Replace' : 'Upload'}
            </button>
            {displaySrc ? (
              <>
                <button
                  type="button"
                  onClick={() => setAdjusting(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-white/40 bg-slate-900/70 px-1.5 py-1 text-[8px] font-bold uppercase text-white"
                >
                  <Move className="h-3 w-3" />
                  Crop
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ imageUrl: null, frame: DEFAULT_CAFE_MENU_ITEM_IMAGE_FRAME });
                    setAdjusting(false);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-300/60 bg-rose-900/70 px-1.5 py-1 text-[8px] font-bold uppercase text-white"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

type CafeMenuItemImageModalProps = {
  open: boolean;
  itemName: string;
  imageUrl: string | null;
  frame: CafeMenuItemImageFrame;
  onChange: (next: { imageUrl: string | null; frame: CafeMenuItemImageFrame }) => void;
  onClose: () => void;
  placeholderGradient?: string;
};

export function CafeMenuItemImageModal({
  open,
  itemName,
  imageUrl,
  frame,
  onChange,
  onClose,
  placeholderGradient,
}: CafeMenuItemImageModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/80 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Menu item photo
            </p>
            <h3 className="text-lg font-bold text-slate-900">{itemName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl">
          <CafeMenuItemImageEditor
            imageUrl={imageUrl}
            frame={frame}
            onChange={onChange}
            size="lg"
            placeholderGradient={placeholderGradient}
            className="h-full w-full"
          />
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Upload a photo, then drag to reposition and use the zoom slider to crop.
        </p>
      </div>
    </div>
  );
}
