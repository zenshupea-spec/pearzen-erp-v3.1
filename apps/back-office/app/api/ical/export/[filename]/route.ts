import { serveShalomIcalExport } from '../../../../executive/shalom/shalom-ical-serve';

export const dynamic = 'force-dynamic';

/** Legacy iCal path — kept for bookmarks; prefer `/ical/export/{id}.ics`. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  return serveShalomIcalExport(filename);
}
