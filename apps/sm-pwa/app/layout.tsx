import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pearzen SM Portal',
  description: 'Sector Manager Command Centre',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="relative min-h-[100dvh] overflow-x-hidden bg-slate-300 font-sans text-slate-900 antialiased">
        <div className="relative z-10 mx-auto min-h-[100dvh] w-full max-w-md">{children}</div>
      </body>
    </html>
  );
}
