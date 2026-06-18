'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { Camera, Loader2, Trash2 } from 'lucide-react';

import { uploadSecurityWebsiteTrainingGalleryImageAction } from '../actions';
import { compressSecurityWebsiteGalleryThumbFile } from '../../../lib/security-website-image-compress-client';
import {
  SECURITY_WEBSITE_HERO_TRAINING_GALLERY_MAX,
  type SecurityWebsiteTrainingGalleryImage,
} from '../../../lib/security-website-types';

type Props = {
  images: SecurityWebsiteTrainingGalleryImage[];
  editing?: boolean;
  onChange?: (images: SecurityWebsiteTrainingGalleryImage[]) => void;
  placement?: 'hero' | 'strip';
};

const COLUMN_COUNT = 2;

/** Split into two disjoint halves so the same photo never appears in both columns. */
function distributeToTwoColumns(
  images: SecurityWebsiteTrainingGalleryImage[],
): SecurityWebsiteTrainingGalleryImage[][] {
  if (images.length === 0) return [[], []];

  const midpoint = Math.ceil(images.length / 2);
  const halves = [images.slice(0, midpoint), images.slice(midpoint)];

  return halves.map((column) => {
    if (column.length === 0) return column;
    const padded = [...column];
    while (padded.length < 4) {
      padded.push(...column);
    }
    return padded;
  });
}

function shouldServeUnoptimized(url: string): boolean {
  return url.startsWith('data:') || url.includes('supabase');
}

function TrainingGalleryThumb({ image }: { image: SecurityWebsiteTrainingGalleryImage }) {
  return (
    <div
      className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-slate-900/80 shadow-[0_18px_36px_-14px_rgba(0,0,0,0.7)] ring-1 ring-white/10"
      style={{ transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
    >
      <Image
        src={image.url}
        alt="Guard training session"
        fill
        className="object-cover"
        sizes="(max-width: 768px) 45vw, 240px"
        quality={75}
        unoptimized={shouldServeUnoptimized(image.url)}
      />
    </div>
  );
}

function TrainingGalleryColumn({
  images,
  direction,
  duration,
  animationDelay,
  paused,
  rotateY,
  scale = 0.86,
}: {
  images: SecurityWebsiteTrainingGalleryImage[];
  direction: 'up' | 'down';
  duration: string;
  animationDelay: string;
  paused?: boolean;
  rotateY: number;
  scale?: number;
}) {
  if (images.length === 0) {
    return (
      <div
        className="h-full min-w-0 rounded-xl bg-white/[0.03]"
        style={{
          transform: `rotateY(${rotateY}deg) scale(${scale})`,
          transformStyle: 'preserve-3d',
        }}
      />
    );
  }

  const loop = [...images, ...images];

  return (
    <div
      className="relative h-full min-w-0 overflow-hidden"
      style={{
        transform: `rotateY(${rotateY}deg) scale(${scale})`,
        transformStyle: 'preserve-3d',
        backfaceVisibility: 'hidden',
      }}
    >
      <div
        className={`cv-training-gallery-track ${
          direction === 'up' ? 'cv-training-gallery-track--up' : 'cv-training-gallery-track--down'
        }`}
        style={
          {
            '--cv-training-duration': duration,
            animationDelay,
            animationPlayState: paused ? 'paused' : 'running',
          } as CSSProperties
        }
      >
        {loop.map((image, index) => (
          <TrainingGalleryThumb key={`${image.id}-${index}`} image={image} />
        ))}
      </div>
    </div>
  );
}

function TrainingGalleryStripThumb({ image }: { image: SecurityWebsiteTrainingGalleryImage }) {
  return (
    <div className="relative h-[4.5rem] w-[6.5rem] shrink-0 overflow-hidden rounded-lg bg-slate-900/80 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:h-20 sm:w-28">
      <Image
        src={image.url}
        alt="Guard training session"
        fill
        className="object-cover"
        sizes="112px"
        quality={75}
        unoptimized={shouldServeUnoptimized(image.url)}
      />
    </div>
  );
}

function TrainingGalleryStrip({
  images,
  paused,
}: {
  images: SecurityWebsiteTrainingGalleryImage[];
  paused?: boolean;
}) {
  if (images.length === 0) return null;

  const duration = Math.max(32, images.length * 3.5);
  const loop = [...images, ...images];

  return (
    <div
      className="relative overflow-hidden"
      style={{ '--cv-training-strip-duration': `${duration}s` } as CSSProperties}
    >
      <div
        className="cv-training-strip-track"
        style={{ animationPlayState: paused ? 'paused' : 'running' } as CSSProperties}
      >
        {loop.map((image, index) => (
          <TrainingGalleryStripThumb key={`${image.id}-${index}`} image={image} />
        ))}
      </div>
    </div>
  );
}

export default function SecurityHeroTrainingGallery({
  images,
  editing,
  onChange,
  placement = 'hero',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const columns = distributeToTwoColumns(images);
  const atCapacity = images.length >= SECURITY_WEBSITE_HERO_TRAINING_GALLERY_MAX;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || !onChange) return;

    const remaining = SECURITY_WEBSITE_HERO_TRAINING_GALLERY_MAX - images.length;
    if (remaining <= 0) return;

    const files = Array.from(fileList).slice(0, remaining);
    setUploading(true);

    const next = [...images];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (!file.type.startsWith('image/')) continue;

        setUploadProgress(`Uploading ${index + 1} of ${files.length}…`);
        const imageId = `training-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
        const dataUrl = await compressSecurityWebsiteGalleryThumbFile(file);
        const result = await uploadSecurityWebsiteTrainingGalleryImageAction(imageId, dataUrl);
        if (result.success && result.url) {
          next.push({ id: imageId, url: result.url });
          onChange([...next]);
        }
      }
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeImage = (id: string) => {
    if (!onChange) return;
    onChange(images.filter((image) => image.id !== id));
  };

  const columnConfigs = [
    { rotateY: 42, scale: 0.86, direction: 'up' as const, duration: '28s', animationDelay: '0s' },
    { rotateY: -42, scale: 0.86, direction: 'down' as const, duration: '34s', animationDelay: '-17s' },
  ];

  const frameClass = 'relative aspect-[16/5] w-full';

  if (placement === 'strip') {
    return (
      <div className="space-y-1.5">
        <TrainingGalleryStrip images={images} paused={editing || reduceMotion} />

        {editing && onChange ? (
          <div className="mx-auto max-w-6xl rounded-xl border border-amber-300/80 bg-amber-50/95 px-4 py-2.5 text-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                Training gallery ({images.length}/{SECURITY_WEBSITE_HERO_TRAINING_GALLERY_MAX})
              </p>
              <button
                type="button"
                disabled={uploading || atCapacity}
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-400/80 bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-900 disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Camera className="h-3 w-3" />
                )}
                {atCapacity ? 'Gallery full' : 'Add photos'}
              </button>
            </div>
            {uploadProgress ? (
              <p className="mt-1 text-[10px] text-amber-800">{uploadProgress}</p>
            ) : (
              <p className="mt-1 text-[10px] leading-snug text-amber-900/80">
                Photos scroll in a single horizontal row. Auto-compressed for fast loading.
              </p>
            )}
            {images.length > 0 ? (
              <div className="mt-2 grid max-h-28 grid-cols-5 gap-1 overflow-y-auto sm:grid-cols-6">
                {images.map((image) => (
                  <div
                    key={image.id}
                    className="group relative aspect-square overflow-hidden rounded border border-amber-200/80 bg-white"
                  >
                    <Image
                      src={image.url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="64px"
                      unoptimized={shouldServeUnoptimized(image.url)}
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="absolute right-0.5 top-0.5 rounded bg-rose-600/90 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                      aria-label="Remove photo"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div
        className="relative mx-auto w-full overflow-hidden"
        style={{ perspective: '1400px', perspectiveOrigin: '50% 42%' }}
        aria-label="Guard training photo gallery"
      >
        <div className={frameClass}>
          <div
            className="absolute inset-0 grid grid-cols-2 gap-2 px-0.5"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {columns.map((column, index) => (
              <TrainingGalleryColumn
                key={index}
                images={column}
                rotateY={columnConfigs[index].rotateY}
                scale={columnConfigs[index].scale}
                direction={columnConfigs[index].direction}
                duration={columnConfigs[index].duration}
                animationDelay={columnConfigs[index].animationDelay}
                paused={editing || reduceMotion}
              />
            ))}
          </div>
          {placement === 'hero' ? (
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/30 via-transparent to-slate-950/35" />
          ) : null}
        </div>
      </div>

      {editing && onChange ? (
        <div className="rounded-xl border border-amber-300/80 bg-amber-50/95 p-2.5 text-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Training gallery ({images.length}/{SECURITY_WEBSITE_HERO_TRAINING_GALLERY_MAX})
            </p>
            <button
              type="button"
              disabled={uploading || atCapacity}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-400/80 bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-900 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Camera className="h-3 w-3" />
              )}
              {atCapacity ? 'Gallery full' : 'Add photos'}
            </button>
          </div>
          {uploadProgress ? (
            <p className="mt-1 text-[10px] text-amber-800">{uploadProgress}</p>
          ) : (
            <p className="mt-1 text-[10px] leading-snug text-amber-900/80">
              Photos split across {COLUMN_COUNT} columns (no duplicates). Auto-compressed for fast
              loading.
            </p>
          )}
          {images.length > 0 ? (
            <div className="mt-2 grid max-h-28 grid-cols-5 gap-1 overflow-y-auto sm:grid-cols-6">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="group relative aspect-square overflow-hidden rounded border border-amber-200/80 bg-white"
                >
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="64px"
                    unoptimized={shouldServeUnoptimized(image.url)}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(image.id)}
                    className="absolute right-0.5 top-0.5 rounded bg-rose-600/90 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
      ) : null}
    </div>
  );
}
