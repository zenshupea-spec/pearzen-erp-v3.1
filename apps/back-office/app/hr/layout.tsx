export default function HRLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 pb-24 font-sans selection:bg-rose-200 selection:text-slate-900">
      {children}
    </main>
  );
}
