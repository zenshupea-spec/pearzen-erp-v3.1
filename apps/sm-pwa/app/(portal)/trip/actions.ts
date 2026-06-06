'use server'

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { redirect } from 'next/navigation';

export async function logTripAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const epf = session.user.email?.split('@')[0].toUpperCase() ?? '';

  const siteName = (formData.get('site_name') as string)?.trim();
  const notes = (formData.get('notes') as string)?.trim();
  const kmStr = formData.get('km_claimed') as string;
  const fuelStr = formData.get('fuel_amount') as string;

  if (!siteName) return { error: 'Destination is required.' };
  if (!notes) return { error: 'Trip purpose / incident description is required.' };

  const kmClaimed = kmStr ? parseFloat(kmStr) : null;
  const fuelAmount = fuelStr ? parseFloat(fuelStr) : null;

  if (kmClaimed !== null && isNaN(kmClaimed)) return { error: 'Invalid km value.' };
  if (fuelAmount !== null && isNaN(fuelAmount)) return { error: 'Invalid fuel amount.' };

  const { error } = await supabase.from('sm_visit_logs').insert({
    sm_epf: epf,
    visit_type: 'INCIDENT_TRIP',
    site_name: siteName,
    notes,
    km_claimed: kmClaimed,
    fuel_amount: fuelAmount,
  });

  if (error) {
    console.error('[SM Trip] Insert error:', error.message);
    return { error: 'Failed to log trip. Please try again.' };
  }

  return { success: true };
}
