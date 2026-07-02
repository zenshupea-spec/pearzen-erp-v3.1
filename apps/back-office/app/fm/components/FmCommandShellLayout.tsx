import type { ReactNode } from 'react';

const MAX_WIDTH: Record<'6xl' | '7xl', string> = {
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
};

/** Shared vault canvas for Finance Manager portal routes. */
export default function FmCommandShellLayout({
  children,
  maxWidth = '7xl',
  className = '',
}: {
  children: ReactNode;
  maxWidth?: '6xl' | '7xl';
  className?: string;
}) {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#eef2f6] text-slate-900 antialiased">
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
        className={`relative z-10 mx-auto w-full min-w-0 max-w-full px-4 py-8 sm:px-6 lg:px-8 ${MAX_WIDTH[maxWidth]} ${className}`.trim()}
      >
        {children}
      </div>
    </main>
  );
}
