import type { ReactNode } from 'react';

const MAX_WIDTH: Record<'6xl' | '7xl' | 'wide', string> = {
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  wide: 'max-w-[1800px]',
};

/** Shared vault canvas for HR portal routes. */
export default function HrCommandShellLayout({
  children,
  maxWidth = 'wide',
  className = '',
}: {
  children: ReactNode;
  maxWidth?: '6xl' | '7xl' | 'wide';
  className?: string;
}) {
  return (
    <main
      className={`relative min-h-screen w-full overflow-x-hidden bg-[#eef2f6] text-slate-900 antialiased ${className}`.trim()}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.48]"
        style={{
          backgroundImage:
            'radial-gradient(rgb(148 163 184 / 0.42) 1.1px, transparent 1.1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-8%] z-0 h-[min(480px,80vw)] w-[min(480px,80vw)] rounded-full blur-[100px]"
        style={{ backgroundColor: 'var(--cvs-glow)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[30%] left-[-15%] z-0 h-[400px] w-[400px] rounded-full blur-[92px]"
        style={{ backgroundColor: 'var(--cvs-glow-teal)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-8%] right-[20%] z-0 h-[360px] w-[360px] rounded-full blur-[88px]"
        style={{ backgroundColor: 'var(--cvs-glow-lime)' }}
      />

      <div
        className={`relative z-10 mx-auto w-full min-w-0 max-w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10 ${MAX_WIDTH[maxWidth]}`.trim()}
      >
        {children}
      </div>
    </main>
  );
}
