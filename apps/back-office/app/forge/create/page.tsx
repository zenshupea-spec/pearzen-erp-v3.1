import Link from 'next/link';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export default async function CreateCompany() {
  async function deployCompany(formData: FormData) {
    'use server';
    const db = await createSupabaseServerClient();
    const rawName = formData.get('company_name') as string;
    const companyName = rawName.toUpperCase();
    const modules = formData.get('modules') as string;

    const { error } = await db.from('companies').insert([{ 
      name: companyName, 
      modules: modules.toUpperCase(),
      billing_locked: false 
    }]);

    if (error) {
      console.error("\n❌ SUPABASE ERROR:", error.message, "\n");
    }

    revalidatePath('/forge');
    redirect('/forge');
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans selection:bg-blue-500election:text-black pb-24">
      <header className="mb-8 flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-600">
            Deploy New Client
          </h1>
          <p className="text-gray-500 text-sm uppercase tracking-wide mt-1">Initialize Tenant Database & RLS</p>
        </div>
        <Link href="/forge" className="bg-gray-900 border border-gray-700 px-4 py-2 rounded-lg text-sm uppercase font-bold hover:bg-gray-800 transition-colors">
          Cancel
        </Link>
      </header>

      <form action={deployCompany} className="max-w-2xl space-y-6">
        <section className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-6 rounded-2xl shadow-lg">
          <h2 className="text-lg font-bold uppercase tracking-wide text-blue-400 mb-4 border-b border-gray-700 pb-2">Tenant Specifications</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Registered Company Name</label>
              <input type="text" name="company_name" required placeholder="E.G., PEARZEN HOLDINGS PLC" className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Module Provisioning (Comma Separated)</label>
              <input type="text" name="modules" defaultValue="OM, HR, FM" className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase" />
              <p className="text-xs text-gray-500 mt-2">Available: OM, HR, FM, HOSPITALITY</p>
            </div>
          </div>
        </section>
        <div className="pt-4">
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all uppercase tracking-widest active:scale-[0.98] shadow-[0_0_20px_rgba(37,99,235,0.3)]">
            INITIALIZE TENANT PROTOCOL
          </button>
        </div>
      </form>
    </div>
  );
}
