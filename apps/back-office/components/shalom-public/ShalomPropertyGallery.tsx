'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { ShalomPropertyGalleryImage } from './shalom-property-media';

export default function ShalomPropertyGallery({
  images,
  propertyName,
}: {
  images: ShalomPropertyGalleryImage[];
  propertyName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  const goTo = useCallback(
    (index: number) => {
      if (images.length === 0) return;
      const wrapped = (index + images.length) % images.length;
      setActiveIndex(wrapped);
    },
    [images.length],
  );

  if (images.length === 0) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center bg-[color:var(--shalom-accent-soft)] sm:aspect-[21/9]">
        <div className="text-center text-[color:var(--shalom-accent)]/50">
          <ImageIcon className="mx-auto h-12 w-12" aria-hidden />
          <p className="mt-2 text-sm font-medium">{propertyName}</p>
        </div>
      </div>
    );
  }

  const active = images[activeIndex];

  return (
    <div className="relative">
      <div className="relative aspect-[16/10] overflow-hidden bg-[color:var(--shalom-accent-soft)] sm:aspect-[21/9]">
        <Image
          key={active.url}
          src={active.url}
          alt={active.alt}
          fill
          priority={activeIndex === 0}
          sizes="(max-width: 1024px) 100vw, 1152px"
          className="object-cover"
        />

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => goTo(activeIndex - 1)}
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => goTo(activeIndex + 1)}
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <p className="absolute bottom-3 right-3 rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {activeIndex + 1} / {images.length}
            </p>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div
          className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-5 py-3 lg:px-8"
          role="tablist"
          aria-label="Property photos"
        >
          {images.map((image, index) => {
            const selected = index === activeIndex;
            return (
              <button
                key={image.url}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={`Photo ${index + 1}`}
                onClick={() => setActiveIndex(index)}
                className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  selected
                    ? 'border-[color:var(--shalom-accent)] ring-2 ring-[color:var(--shalom-accent-soft)]'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <Image src={image.url} alt="" fill sizes="96px" className="object-cover" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
