'use client';

import type { CSSProperties } from 'react';
import Image from 'next/image';

import SecurityEditableImage from './SecurityEditableImage';
import type { SecurityWebsiteImageSlot } from '../../../lib/security-website-images';
import type { SecurityWebsiteImageFrame } from '../../../lib/security-website-image-frame';
import {
  CV_BROCHURE_ABOUT_IMAGE_CROP,
  CV_BROCHURE_VISITING_OFFICERS_IMAGE_CROP,
} from '../../../lib/security-website-brand';

type TimelineImageConfig = {
  src: string;
  hasCustom: boolean;
  slot: SecurityWebsiteImageSlot;
  frame: SecurityWebsiteImageFrame;
  defaultFrame: SecurityWebsiteImageFrame;
  onUploaded?: (url: string) => void;
  onFrameChange?: (frame: SecurityWebsiteImageFrame) => void;
};

type TimelineItem = {
  year: string;
  title: string;
  description: string;
  imageAlt: string;
  objectFit?: 'cover' | 'contain';
  image: TimelineImageConfig;
};

/** Landscape timeline thumbnails — 5:3 frame shortened (100:36.309 ≈ 40% less height). */
const TIMELINE_IMAGE_FRAME_CLASS =
  'relative w-full aspect-[100/36.309] overflow-hidden rounded-xl border border-slate-200 bg-slate-900';

function timelineImageClass(item: TimelineItem): string {
  return item.objectFit === 'contain' ? 'object-contain' : 'object-cover';
}

function shouldServeTimelineImageUnoptimized(src: string): boolean {
  return src.startsWith('data:') || src.includes('supabase');
}

function timelineImageStyle(item: TimelineItem): CSSProperties {
  const frame = item.image.frame;
  const scale = item.objectFit === 'contain' ? 1 : frame.scale;
  if (scale <= 1 && item.objectFit !== 'contain') {
    return { objectPosition: frame.objectPosition };
  }
  return {
    objectPosition: frame.objectPosition,
    transform: scale > 1 ? `scale(${scale})` : undefined,
    transformOrigin: frame.objectPosition,
  };
}

function shortenText(text: string, maxLen = 130): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen);
  const lastPeriod = cut.lastIndexOf('.');
  if (lastPeriod > maxLen * 0.5) return cut.slice(0, lastPeriod + 1);
  return `${cut.trimEnd()}…`;
}

function TimelineCardImage({
  item,
  priority,
  editing,
}: {
  item: TimelineItem;
  priority?: boolean;
  editing?: boolean;
}) {
  const { src, hasCustom, slot, frame, defaultFrame, onUploaded, onFrameChange } = item.image;

  if (editing && onUploaded) {
    return (
      <div className={TIMELINE_IMAGE_FRAME_CLASS}>
        <SecurityEditableImage
          src={src}
          alt={item.imageAlt}
          slot={slot}
          editing={editing}
          hasCustomImage={hasCustom}
          onUploaded={onUploaded}
          frame={frame}
          defaultFrame={defaultFrame}
          onFrameChange={onFrameChange}
          className="absolute inset-0"
          objectFit={item.objectFit}
        />
      </div>
    );
  }

  return (
    <div className={TIMELINE_IMAGE_FRAME_CLASS}>
      <Image
        key={src}
        src={src}
        alt={item.imageAlt}
        fill
        className={timelineImageClass(item)}
        style={timelineImageStyle(item)}
        sizes="(max-width: 640px) 85vw, 320px"
        priority={priority}
        unoptimized={shouldServeTimelineImageUnoptimized(src)}
      />
    </div>
  );
}

function TimelineCopy({ item }: { item: TimelineItem }) {
  return (
    <>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-700">{item.year}</p>
      <h3 className="mt-1 text-sm font-semibold uppercase tracking-tight text-slate-900 sm:text-base">
        {item.title}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-sm">{item.description}</p>
    </>
  );
}

type Props = {
  aboutBody: string;
  editing?: boolean;
  aboutImage: TimelineImageConfig;
  coverageImage: TimelineImageConfig;
  monitoringImage: TimelineImageConfig;
};

export default function SecurityCompanyTimeline({
  aboutBody,
  editing,
  aboutImage,
  coverageImage,
  monitoringImage,
}: Props) {
  const milestones: TimelineItem[] = [
    {
      year: '2008',
      title: 'Founded in Colombo',
      description: shortenText(aboutBody),
      imageAlt: 'Classic Venture security team',
      objectFit: CV_BROCHURE_ABOUT_IMAGE_CROP.objectFit,
      image: aboutImage,
    },
    {
      year: 'Nationwide',
      title: 'Island-wide coverage',
      description:
        'Covering the full island — trained teams mobilized wherever your site needs security, from Colombo to the regions.',
      imageAlt: 'Classic Venture officers in nationwide formation',
      image: coverageImage,
    },
    {
      year: 'Today',
      title: 'Security you can prove',
      description:
        'GPS-verified attendance, supervisor spot checks, and a live client portal on one contract.',
      imageAlt: 'Classic Venture guard checking in on the field portal app',
      image: monitoringImage,
    },
  ];

  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">Our story</p>
          <h2 className="mt-1 text-2xl font-semibold uppercase tracking-tight text-slate-900 sm:text-3xl">
            Nearly two decades of trusted service
          </h2>
        </div>

        <ol className="mt-8 sm:hidden">
          {milestones.map((item, index) => (
            <li key={item.year} className="relative pl-8 pb-8 last:pb-0">
              <span
                className="absolute left-0 top-1.5 z-10 h-3 w-3 rounded-full border-2 border-white bg-red-700 shadow"
                aria-hidden
              />
              {index < milestones.length - 1 ? (
                <span
                  className="absolute bottom-0 left-[5px] top-5 w-px bg-red-200"
                  aria-hidden
                />
              ) : null}
              <TimelineCopy item={item} />
              <div className="mt-3">
                <TimelineCardImage item={item} priority={index === 0} editing={editing} />
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 hidden space-y-3 sm:block">
          <ol className="grid grid-cols-3 gap-5">
            {milestones.map((item, index) => (
              <li key={`img-${item.year}`}>
                <TimelineCardImage item={item} priority={index === 0} editing={editing} />
              </li>
            ))}
          </ol>

          <ol className="grid grid-cols-3 gap-5" aria-hidden>
            {milestones.map((item, index) => (
              <li key={`rail-${item.year}`} className="flex items-center py-1">
                {index > 0 ? <span className="h-px flex-1 bg-red-200" /> : <span className="flex-1" />}
                <span className="mx-1 h-3 w-3 shrink-0 rounded-full border-2 border-white bg-red-700 shadow" />
                {index < milestones.length - 1 ? (
                  <span className="h-px flex-1 bg-red-200" />
                ) : (
                  <span className="flex-1" />
                )}
              </li>
            ))}
          </ol>

          <ol className="grid grid-cols-3 gap-5">
            {milestones.map((item) => (
              <li key={`copy-${item.year}`}>
                <TimelineCopy item={item} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}