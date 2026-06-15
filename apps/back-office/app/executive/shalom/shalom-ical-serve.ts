import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  buildShalomIcalFeed,
  parseShalomIcalPropertyId,
  SHALOM_ICAL_EXPORT_CHANNELS,
} from './shalom-ical-export';

/** Channels pushed to OTAs — excludes Airbnb/Booking imports to avoid sync loops. */
export async function serveShalomIcalExport(filename: string): Promise<NextResponse> {
  const propertyId = parseShalomIcalPropertyId(filename);
  if (!propertyId) {
    return new NextResponse('Not found', { status: 404 });
  }

  const db = createSupabaseServiceClient();
  const { data: property, error: propError } = await db
    .from('shalom_properties')
    .select('id, name')
    .eq('id', propertyId)
    .maybeSingle();

  if (propError || !property) {
    return new NextResponse('Not found', { status: 404 });
  }

  const baseQuery = () =>
    db
      .from('shalom_bookings')
      .select('id, guest_name, channel, check_in, check_out, notes')
      .eq('property_id', propertyId)
      .in('channel', [...SHALOM_ICAL_EXPORT_CHANNELS])
      .order('check_in', { ascending: true });

  let { data: bookings, error: bookingError } = await baseQuery().eq('ota_imported', false);

  if (bookingError && /ota_imported/i.test(bookingError.message ?? '')) {
    ({ data: bookings, error: bookingError } = await baseQuery());
  }

  if (bookingError) {
    return new NextResponse('Calendar unavailable', { status: 500 });
  }

  const body = buildShalomIcalFeed(property.name, bookings ?? []);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
