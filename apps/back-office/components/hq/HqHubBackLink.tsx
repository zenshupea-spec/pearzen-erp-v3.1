import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access';
import { canAccessHqHub } from '../../lib/hq-hub';

type Props = {
  className?: string;
};

export default async function HqHubBackLink({
  className = 'mb-5 inline-flex max-w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 sm:mb-6 sm:text-xs',
}: Props) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!canAccessHqHub(profile.role)) return null;

  return (
    <Link href="/dashboard" className={className}>
      <ArrowLeft className="h-4 w-4 shrink-0" />
      <span className="truncate">Return to HQ Hub</span>
    </Link>
  );
}
