import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { redirect } from 'next/navigation';
import IncidentReportForm from './IncidentReportForm';

export default async function IncidentReportPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  return (
    <div className="relative flex min-h-[100dvh] flex-1 flex-col p-6">
      <header className="mb-8 flex items-center gap-4 border-b border-slate-200/80 pb-4">
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          aria-label="Back to home"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Intel
          </p>
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
            Report incident
          </h1>
        </div>
      </header>

      <IncidentReportForm />
    </div>
  );
}
