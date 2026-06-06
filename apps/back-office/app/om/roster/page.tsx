import { CalendarDays } from 'lucide-react';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from '../../../lib/company-context';
import { getLiveRosters } from '../../actions/time-engine';
import OmCommandShell from '../components/OmCommandShell';
import RosterGrid from './RosterGrid';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Roster Engine | Pearzen ERP',
};

async function fetchRosterEmployees(companyId: string | null) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select('id, emp_number, full_name, company_id')
    .eq('status', 'ACTIVE')
    .in('group', ['GUARD', 'GUARD_FIELD'])
    .order('emp_number', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) {
    console.error('[OM roster] employees:', error.message);
    return [];
  }
  return data ?? [];
}

async function fetchRosterSites(companyId: string | null) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('site_profiles')
    .select('id, site_name')
    .order('site_name', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) {
    console.error('[OM roster] sites:', error.message);
    return [];
  }
  return data ?? [];
}

export default async function RosterPage() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);

  const [employees, sites] = await Promise.all([
    fetchWithRosterCompanyFallback(fetchRosterEmployees, sessionCompanyId),
    fetchWithRosterCompanyFallback(fetchRosterSites, sessionCompanyId),
  ]);

  const liveRosters = await getLiveRosters();

  return (
    <OmCommandShell
      title="Roster generation engine"
      subtitle="Assign guards to sites and planned shift windows"
      icon={CalendarDays}
      accent="sky"
      maxWidth="6xl"
    >
      <RosterGrid
        employees={employees as Parameters<typeof RosterGrid>[0]['employees']}
        sites={sites as Parameters<typeof RosterGrid>[0]['sites']}
        initialRosters={(liveRosters ?? []) as Parameters<typeof RosterGrid>[0]['initialRosters']}
        isDemo={false}
      />
    </OmCommandShell>
  );
}
