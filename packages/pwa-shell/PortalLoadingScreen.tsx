export type PortalLoadingAccent =
  | 'indigo'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'violet'
  | 'sky'
  | 'slate';

const ACCENT_ARC: Record<PortalLoadingAccent, string> = {
  indigo: 'border-t-indigo-400/50',
  emerald: 'border-t-emerald-400/50',
  rose: 'border-t-rose-400/50',
  amber: 'border-t-amber-400/50',
  violet: 'border-t-violet-400/50',
  sky: 'border-t-sky-400/50',
  slate: 'border-t-slate-400/45',
};

const SPINNER_SIZE_PX = 14;

export default function PortalLoadingScreen({
  label,
  accent = 'indigo',
  overlay = false,
  fullscreen = true,
  variant = 'light',
  scrim = false,
  className = '',
}: {
  label?: string;
  accent?: PortalLoadingAccent;
  /** Floats over the current UI — does not replace the page. */
  overlay?: boolean;
  fullscreen?: boolean;
  variant?: 'light' | 'dark';
  /** Opaque veil — hides FOUC / layout jank behind the spinner. */
  scrim?: boolean;
  className?: string;
}) {
  const arc = ACCENT_ARC[accent] ?? ACCENT_ARC.indigo;
  const isDark = variant === 'dark';
  const scrimClass = scrim
    ? isDark
      ? 'bg-zinc-950/85 backdrop-blur-sm'
      : 'bg-white/90 backdrop-blur-sm'
    : '';

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className={[
          'h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-transparent',
          isDark ? 'border-slate-700/70' : 'border-slate-200/70',
          arc,
        ].join(' ')}
        style={{
          width: SPINNER_SIZE_PX,
          height: SPINNER_SIZE_PX,
          flexShrink: 0,
        }}
        aria-hidden
      />
      {label ? (
        <p
          className={`max-w-[14rem] px-4 text-center text-[11px] font-medium ${
            isDark ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          {label}
        </p>
      ) : null}
    </div>
  );

  if (overlay) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={label ?? 'Loading'}
        className={[
          'pointer-events-none fixed inset-0 z-[120] flex items-center justify-center',
          scrimClass,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {spinner}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label ?? 'Loading'}
      className={[
        'flex flex-col items-center justify-center',
        fullscreen
          ? 'fixed inset-0 z-[120]'
          : 'min-h-[min(100dvh,28rem)] w-full flex-1 py-20',
        fullscreen ? scrimClass : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {spinner}
    </div>
  );
}
