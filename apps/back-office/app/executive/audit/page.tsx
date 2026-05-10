import Link from 'next/link';
import { createClient } from '../../../utils/supabase/server';

export default async function AuditLogViewer() {
  const supabase = await createClient();

  // 1. FETCH LIVE DB DATA (Limit to last 100 for performance)
  const { data: dbLogs, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  // 2. FALLBACKS (If DB is empty or not created yet)
  const logs = dbLogs && dbLogs.length > 0 ? dbLogs : [
    { id: 'LOG-8821', created_at: '2026-05-09 13:15:00', actor_id: 'MD-01 (SUPER ADMIN)', action: 'UPDATED SVAT_RATE FROM 15.0 TO 18.0', severity: 'HIGH' },
    { id: 'LOG-8820', created_at: '2026-05-09 11:30:22', actor_id: 'HR-04', action: 'REQUESTED CUSTOM SALARY OVERRIDE FOR EMP-1042', severity: 'MEDIUM' },
    { id: 'LOG-8819', created_at: '2026-05-09 09:05:11', actor_id: 'OM-02', action: 'APPROVED RED FLAGGED SHIFT (EMP-0081) - TAMPERING OVERRIDE', severity: 'HIGH' },
    { id: 'LOG-8818', created_at: '2026-05-08 18:45:00', actor_id: 'FM-01', action: 'GENERATED BULK BANK CSV EXPORT', severity: 'LOW' }
  ];

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans selection:bg-green-500 selection:text-black pb-24">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">
            Universal Audit Log
          </h1>
          <p className="text-gray-500 text-sm uppercase tracking-wide mt-1">
            Immutable Record of System Actions
          </p>
        </div>
        <Link href="/executive" className="bg-gray-900 border border-gray-700 px-4 py-2 rounded-lg text-sm uppercase font-bold hover:bg-gray-800 transition-colors">
          Back
        </Link>
      </header>

      {/* Audit Log Ledger */}
      <section className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-6 rounded-2xl shadow-lg">
        <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
          <input 
            type="text" 
            placeholder="SEARCH LOGS (USER ID, ACTION)..." 
            className="w-full max-w-md bg-black border border-gray-700 rounded-lg p-3 text-white font-mono text-sm focus:ring-2 focus:ring-green-500 outline-none uppercase"
          />
          <button className="ml-4 bg-gray-800 hover:bg-gray-700 text-white px-4 py-3 rounded border border-gray-600 text-xs uppercase font-bold transition-colors whitespace-nowrap">
            Export PDF
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-mono">
            <thead className="text-xs text-gray-500 uppercase bg-gray-900 border-b border-gray-800">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor ID</th>
                <th className="px-4 py-3">Action Recorded</th>
                <th className="px-4 py-3 text-right">Severity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log: any) => (
                <tr key={log.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-4 text-gray-400">
                    {new Date(log.created_at).toLocaleString('en-GB', { hour12: false })}
                  </td>
                  <td className="px-4 py-4 font-bold text-green-400">{log.actor_id}</td>
                  <td className="px-4 py-4 text-white uppercase">{log.action}</td>
                  <td className="px-4 py-4 text-right">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      log.severity === 'HIGH' ? 'bg-red-900/30 text-red-500 border border-red-800' : 
                      log.severity === 'MEDIUM' ? 'bg-yellow-900/30 text-yellow-500 border border-yellow-800' : 
                      'bg-gray-800 text-gray-400 border border-gray-700'
                    }`}>
                      {log.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}