import TempRosterClient from './TempRosterClient';
import { getTempRosterDeskData } from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TempRosterDesk() {
  const data = await getTempRosterDeskData();
  return <TempRosterClient initialData={data} />;
}
