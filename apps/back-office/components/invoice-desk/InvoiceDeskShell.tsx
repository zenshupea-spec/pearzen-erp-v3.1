import type { ReactNode } from 'react';

/** Light canvas for Invoice Desk — soft sky, peach, and violet ambient washes. */
export function InvoiceDeskShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f4f8fc] text-slate-900 antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.42]"
        style={{
          backgroundImage:
            'radial-gradient(rgb(125 211 252 / 0.45) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-6%] h-[min(480px,80vw)] w-[min(480px,80vw)] rounded-full bg-sky-300/35 blur-[96px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[18%] left-[-14%] h-[420px] w-[420px] rounded-full bg-violet-300/28 blur-[88px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-8%] right-[12%] h-[380px] w-[380px] rounded-full bg-rose-200/40 blur-[84px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[48%] right-[-4%] h-[260px] w-[260px] rounded-full bg-amber-200/35 blur-[72px]"
      />
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  );
}

/** Frosted panel tuned for Invoice Desk (slightly warmer white). */
export function InvoiceDeskCard({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/90 bg-white/72 shadow-[0_14px_40px_-12px_rgba(56,189,248,0.18)] backdrop-blur-xl backdrop-saturate-[1.4] ring-1 ring-sky-100/80 ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/** Opaque panel for modals — avoids stacked blur washing out small type. */
export function InvoiceDeskModalCard({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border border-sky-100 bg-white shadow-[0_8px_24px_-8px_rgba(56,189,248,0.2)] ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
