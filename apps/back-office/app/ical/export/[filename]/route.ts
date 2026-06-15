import { serveShalomIcalExport } from '../../../executive/shalom/shalom-ical-serve';

export const dynamic = 'force-dynamic';

/** Public iCal feed — canonical path for Airbnb / Booking.com import URLs. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  return serveShalomIcalExport(filename);
}
