import Link from 'next/link';

export const dynamic = "force-dynamic"; // Ensure fresh data for the MD

export default async function ExecutiveDashboard() {
  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 pb-24 font-sans selection:bg-green-500 selection:text-black">
      {/* Header */}
      <header className="mb-8 border-b border-gray-800 pb-4">
        <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">
          Executive Vault
        </h1>
        <p className="text-gray-500 text-sm uppercase tracking-wide mt-1">
          Global Command & Control
        </p>
      </header>

      {/* Live Financial Metrics (Placeholder structure for Phase 6 API) */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-4 rounded-xl shadow-lg">
          <p className="text-xs text-gray-500 uppercase font-bold">MTD Payroll</p>
          <p className="text-lg md:text-xl font-mono mt-1">LKR 0.00</p>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-4 rounded-xl shadow-lg">
          <p className="text-xs text-gray-500 uppercase font-bold">Active Guards</p>
          <p className="text-lg md:text-xl font-mono mt-1 text-green-400">0 / 0</p>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-4 rounded-xl shadow-lg">
          <p className="text-xs text-gray-500 uppercase font-bold">Pending Advances</p>
          <p className="text-lg md:text-xl font-mono mt-1 text-yellow-500">0</p>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-4 rounded-xl shadow-lg">
          <p className="text-xs text-gray-500 uppercase font-bold">Tamper Flags</p>
          <p className="text-lg md:text-xl font-mono mt-1 text-red-500">0</p>
        </div>
      </section>

      {/* Navigation Gateway */}
      <section className="space-y-4">
        <Link href="/executive/settings" className="block">
          <div className="group bg-gradient-to-br from-gray-900 to-black border border-gray-800 hover:border-green-500/50 p-5 rounded-2xl transition-all duration-300">
            <h2 className="text-lg font-bold uppercase tracking-wide group-hover:text-green-400 transition-colors">⚙️ Dynamic Settings</h2>
            <p className="text-sm text-gray-500 mt-2 line-clamp-2">Manage SSCL/SVAT taxes, edit Payroll Constants, and restrict Bank Directories.</p>
          </div>
        </Link>

        <Link href="/executive/matrix" className="block">
          <div className="group bg-gradient-to-br from-gray-900 to-black border border-gray-800 hoverder-green-500/50 p-5 rounded-2xl transition-all duration-300">
            <h2 className="text-lg font-bold uppercase tracking-wide group-hover:text-green-400 transition-colors">📊 Compensation Matrix</h2>
            <p className="text-sm text-gray-500 mt-2 line-clamp-2">Create ranks, adjust Default Basic Salaries, and approve custom HR pay requests.</p>
          </div>
        </Link>

        <Link href="/executive/audit" className="block">
          <div className="group bg-gradient-to-br from-gray-900 to-black border border-gray-800 hover:border-green-500/50 p-5 rounded-2xl transition-all duration-300">
            <h2 className="text-lg font-bold uppercase tracking-wide group-hover:text-green-400 transition-colors">📜 Universal Audit Log</h2>
            <p className="text-sm text-gray-500 mt-2 line-clamp-2">Immutable record of all system actions, edits, and administrative overrides.</p>
          </div>
        </Link>
      </section>
    </div>
  );
}
