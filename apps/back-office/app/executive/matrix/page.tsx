import Link from 'next/link';
import { createClient } from '../../../utils/supabase/server';
import { revalidatePath } from 'next/cache';

export default async function MatrixEditor() {
  const supabase = await createClient();

  // 1. FETCH LIVE DB DATA
  const { data: dbRanks, error: rankError } = await supabase
    .from('ranks')
    .select('*')
    .order('basic', { ascending: false });

  const { data: dbRequests, error: reqError } = await supabase
    .from('salary_requests')
    .select('*')
    .eq('status', 'PENDING');

  // 2. INLINE SERVER ACTIONS (Executes securely on the Node server)
  async function approveRequest(formData: FormData) {
    'use server';
    const id = formData.get('request_id');
    const db = await createClient();
    await db.from('salary_requests').update({ status: 'APPROVED' }).eq('id', id);
    revalidatePath('/executive/matrix'); // Auto-refreshes the page data
  }

  async function rejectRequest(formData: FormData) {
    'use server';
    const id = formData.get('request_id');
    const db = await createClient();
    await db.from('salary_requests').update({ status: 'REJECTED' }).eq('id', id);
    revalidatePath('/executive/matrix');
  }

  // 3. FALLBACKS (Preserves your UI if Supabase tables are not created yet)
  const activeRanks = dbRanks && dbRanks.length > 0 ? dbRanks : [
    { id: 1, title: 'JSO', basic: 25000, increment: 1000, structure: 'FORMULA' },
    { id: 2, title: 'OIC', basic: 35000, increment: 1500, structure: 'FORMULA' },
    { id: 3, title: 'CAFE BARISTA', basic: 30000, increment: 1200, structure: 'FIXED' }
  ];

  const pendingRequests = dbRequests && dbRequests.length > 0 ? dbRequests : [
    { id: 'dummy-1', emp_id: 'EMP-1042', name: 'JOHN DOE', rank: 'JSO', requested_basic: 28000, standard_basic: 25000 }
  ];

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans selection:bg-green-500 selection:text-black pb-24">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">
            Compensation Matrix
          </h1>
          <p className="text-gray-500 text-sm uppercase tracking-wide mt-1">
            Rank Engineering & Pay Structures
          </p>
        </div>
        <Link href="/executive" className="bg-gray-900 border border-gray-700 px-4 py-2 rounded-lg text-sm uppercase font-bold hover:bg-gray-800 transition-colors">
          Back
        </Link>
      </header>

      {/* Pending HR Approvals (YELLOW FLAGS) */}
      {pendingRequests.length > 0 && (
        <section className="mb-8 border border-yellow-500/50 bg-yellow-900/10 p-6 rounded-2xl">
          <h2 className="text-sm font-bold uppercase tracking-widest text-yellow-500 mb-4 flex items-center">
            <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse mr-2"></span>
            Pending Custom Salary Requests ({pendingRequests.length})
          </h2>
          
          {pendingRequests.map((req: any) => (
            <div key={req.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex justify-between items-center mb-2">
              <div>
                <p className="font-bold uppercase text-white">{req.emp_id}: {req.name}</p>
                <p className="text-xs text-gray-400 uppercase mt-1">
                  Rank: {req.rank} | Requested Basic: LKR {req.requested_basic?.toLocaleString()} (Standard: {req.standard_basic?.toLocaleString()})
                </p>
              </div>
              <div className="flex space-x-2">
                <form action={rejectRequest}>
                  <input type="hidden" name="request_id" value={req.id} />
                  <button type="submit" className="bg-red-900/50 hover:bg-red-900 text-red-500 border border-red-700 px-4 py-2 rounded uppercase text-xs font-bold transition-colors">
                    Reject
                  </button>
                </form>
                <form action={approveRequest}>
                  <input type="hidden" name="request_id" value={req.id} />
                  <button type="submit" className="bg-green-900/50 hover:bg-green-900 text-green-500 border border-green-700 px-4 py-2 rounded uppercase text-xs font-bold transition-colors">
                    Approve
                  </button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Active Ranks Ledger */}
      <section className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-6 rounded-2xl shadow-lg">
        <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
          <h2 className="text-lg font-bold uppercase tracking-wide text-green-400">Active Ranks Ledger</h2>
          <button className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded border border-gray-600 text-xs uppercase font-bold transition-colors">
            + Create New Rank
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500 uppercase bg-gray-900 border-b border-gray-800">
              <tr>
                <th className="px-4 py-3">Rank Title</th>
                <th className="px-4 py-3">Pay Structure</th>
                <th className="px-4 py-3">Default Basic (LKR)</th>
                <th className="px-4 py-3">Annual Increment (LKR)</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeRanks.map((rank: any) => (
                <tr key={rank.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-4 font-bold text-white uppercase">{rank.title}</td>
                  <td className="px-4 py-4">
                    <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700 uppercase font-mono">
                      {rank.structure}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono text-green-400">{rank.basic?.toLocaleString()}</td>
                  <td className="px-4 py-4 font-mono text-yellow-500">+{rank.increment?.toLocaleString()}</td>
                  <td className="px-4 py-4 text-right">
                    <button className="text-gray-400 hover:text-white uppercase text-xs font-bold underline">Edit</button>
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