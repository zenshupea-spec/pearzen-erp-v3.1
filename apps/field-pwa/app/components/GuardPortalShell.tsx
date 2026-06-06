import BrandWatermarkBackground from './BrandWatermarkBackground';

export default function GuardPortalShell({
  children,
  logoUrl,
}: {
  children: React.ReactNode;
  logoUrl: string | null;
}) {
  return (
    <main className="relative flex min-h-[100dvh] w-full max-w-md flex-col overflow-hidden border-x border-slate-300/80 bg-white shadow-[0_0_60px_-12px_rgba(15,23,42,0.25)]">
      <BrandWatermarkBackground logoUrl={logoUrl} />
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </main>
  );
}
