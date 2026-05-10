import { redirect } from 'next/navigation';

export default async function ForgeLayout({ children }: { children: React.ReactNode }) {
  // TODO: Phase 8 Auth Wiring - Await cookies() and verify Super Admin UUID
  const isSuperAdmin = true; // Hardcoded true for UI scaffolding

  if (!isSuperAdmin) {
    redirect('/unauthorized');
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-green-500 selection:text-black">
      {/* Top Warning Banner for God Mode */}
      <div className="w-full bg-red-900/80 text-red-100 text-xs font-bold text-center py-1 uppercase tracking-widest border-b border-red-500">
        ⚠ CAUTION: SUPER ADMIN GOD MODE ACTIVE ⚠
      </div>
      <main className="p-4 md:p-8 pb-24 font-sans">
        {children}
      </ma    </div>
  );
}
