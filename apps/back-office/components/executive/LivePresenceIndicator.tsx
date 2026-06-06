'use client';

/** Mock avatar URLs — professional headshots for MD/OD presence preview */
const AVATARS = {
  md: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=64&h=64&fit=crop&crop=face',
  od: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=64&h=64&fit=crop&crop=face',
} as const;

function PresenceAvatar({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`h-7 w-7 rounded-full border-2 border-white object-cover shadow-sm ring-1 ring-slate-900/5 ${className}`}
    />
  );
}

/**
 * Live Presence cluster — overlapping avatars + co-viewer label (mock).
 */
export function LivePresenceIndicator() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Overlapping avatar stack */}
      <div className="relative flex h-7 w-10 flex-shrink-0">
        <PresenceAvatar
          src={AVATARS.od}
          alt="OD Nimal"
          className="absolute left-0 z-10"
        />
        <PresenceAvatar
          src={AVATARS.md}
          alt="Managing Director"
          className="absolute left-3.5 z-0 opacity-90"
        />
        <span className="absolute -bottom-0.5 -right-0.5 z-20 h-2 w-2 rounded-full border border-white bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
      </div>

      <p className="text-[11px] font-medium leading-snug text-slate-600">
        <span aria-hidden className="mr-0.5">👥</span>
        <span className="font-bold text-slate-800">OD Nimal</span>
        {' '}is also viewing this page
      </p>
    </div>
  );
}
