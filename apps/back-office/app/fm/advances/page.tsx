import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { processAdvanceFormAction } from './actions';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdvancesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect('/login/head-office');

  // Fetch pending advances linked to the employee profile
  const { data: pendingAdvances, error } = await supabase
    .from('salary_advances')
    .select('*, employees(full_name, emp_number)')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });

  if (error) console.error("❌ FETCH ERROR:", error.message);

  return (
    <div className="p-8 space-y-8 bg-black min-h-screen text-white">
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <Link href="/fm" className="text-xs text-blue-500 hover:text-blue-400 font-mono mb-2 block">
            &larr; BACK TO FM COMMAND CENTER
          </Link>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Advance Approvals</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs font-mono text-amber-500">MD APPROVAL REQUIRED</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {pendingAdvances?.map((advance) => (
          <div key={advance.id} className="bg-slate-900 border border-slate-800 p-6 rounded-sm flex justify-between items-center">
            <div>
              <p className="text-xs text-slate-500 font-mono">{advance.id}</p>
              <h3 className="text-lg font-bold uppercase">
                {advance.employees?.full_name} ({advance.employees?.emp_number})
              </h3>
              <p className="text-2xl font-black text-amber-400 my-1">
                LKR {Number(advance.amount).toLocaleString()}
              </p>
              <p className="text-sm text-slate-400">REASON: {advance.reason || 'N/A'}</p>
            </div>
            
            <form action={processAdvanceFormAction} className="flex gap-2">
              <input type="hidden" name="advanceId" value={advance.id} />
              <button name="status" value="APPROVED" className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 text-xs font-bold uppercase transition-colors">
                APPROVE
              </button>
              <button name="status" value="REJECTED" className="bg-rose-600 hover:bg-rose-500 text-white px-6 py-3 text-xs font-bold uppercase transition-colors">
                REJECT
              </button>
            </form>
          </div>
        ))}
        {(!pendingAdvances || pendingAdvances.length === 0) && (
          <p className="text-slate-600 italic">No pending salary advances to review.</p>
        )}
      </div>
    </div>
  );
}
