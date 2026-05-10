import Link from 'next/link';
import { createClient } from '../../../utils/supabase/server';
import { revalidatePath } from 'next/cache';

export default async function SettingsEditor() {
  const supabase = await createClient();

  // 1. FETCH LIVE DB DATA
  // Assuming a single-row config table with id = 1
  const { data: dbSettings, error } = await supabase
    .from('global_settings')
    .select('*')
    .eq('id', 1)
    .single();

  // 2. INLINE SERVER ACTION
  async function updateSettings(formData: FormData) {
    'use server';
    const db = await createClient();
    
    const payload = {
      sscl_rate: parseFloat(formData.get('sscl_rate') as string),
      svat_rate: parseFloat(formData.get('svat_rate') as string),
      working_days_divisor: parseInt(formData.get('working_days_divisor') as string, 10),
      ot_multiplier: parseFloat(formData.get('ot_multiplier') as string),
      commercial_bank_only: formData.get('commercial_bank_only') === 'on',
    };

    // Upsert or update the global settings row
    await db.from('global_settings').upsert({ id: 1, ...payload });
    
    revalidatePath('/executive/settings');
  }

  // 3. FALLBACKS (If DB is empty)
  const settings = dbSettings || {
    sscl_rate: 2.5,
    svat_rate: 18.0,
    working_days_divisor: 26,
    ot_multiplier: 1.5,
    commercial_bank_only: true,
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 font-sans selection:bg-green-500 selection:text-black pb-24">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">
            Dynamic Settings
          </h1>
          <p className="text-gray-500 text-sm uppercase tracking-wide mt-1">
            Global Variables & Constraints
          </p>
        </div>
        <Link href="/executive" className="bg-gray-900 border border-gray-700 px-4 py-2 rounded-lg text-sm uppercase font-bold hover:bg-gray-800 transition-colors">
          Back
        </Link>
      </header>

      <form action={updateSettings} className="max-w-2xl space-y-6">
        
        {/* Tax Configuration */}
        <section className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-6 rounded-2xl shadow-lg">
          <h2 className="text-lg font-bold uppercase tracking-wide text-green-400 mb-4 border-b border-gray-700 pb-2">Tax Configuration</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">SSCL Rate (%)</label>
              <input 
                type="number" 
                name="sscl_rate"
                step="0.1"
                defaultValue={settings.sscl_rate}
                className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">SVAT Rate (%)</label>
              <input 
                type="number" 
                name="svat_rate"
                step="0.1"
                defaultValue={settings.svat_rate}
                className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
          </div>
        </section>

        {/* Payroll Constants */}
        <section className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-6 rounded-2xl shadow-lg">
          <h2 className="text-lg font-bold uppercase tracking-wide text-green-400 mb-4 border-b border-gray-700 pb-2">Payroll Constants</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Working Days Divisor</label>
              <input 
                type="number" 
                name="working_days_divisor"
                defaultValue={settings.working_days_divisor}
                className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">OT Multiplier</label>
              <input 
                type="number" 
                name="ot_multiplier"
                step="0.1"
                defaultValue={settings.ot_multiplier}
                className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
          </div>
        </section>

        {/* Banking Rules */}
        <section className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-6 rounded-2xl shadow-lg">
          <h2 className="text-lg font-bold uppercase tracking-wide text-green-400 mb-4 border-b border-gray-700 pb-2">Banking Rules</h2>
          <div className="flex items-center justify-between bg-black p-4 rounded-lg border border-gray-700">
            <div>
              <p className="font-bold uppercase text-sm">Commercial Bank Only</p>
              <p className="text-xs text-gray-500 mt-1">Force YELLOW flags on FM export for outside banks.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                name="commercial_bank_only"
                defaultChecked={settings.commercial_bank_only}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>
        </section>

        {/* Action Bar */}
        <div className="pt-4">
          <button 
            type="submit" 
            className="w-full bg-green-600 hover:bg-green-500 text-black font-bold py-4 rounded-xl transition-all uppercase tracking-widest active:scale-[0.98]"
          >
            Commit Settings to DB
          </button>
        </div>
      </form>
    </div>
  );
}