import { redirect } from 'next/navigation';
import ReportIncidentClient from './ReportIncidentClient';
import { getCurrentSmEpf, getSMAssignments } from '../../../lib/sm-assignments';

export const dynamic = 'force-dynamic';

export default async function ReportIncidentPage() {
  const epf = await getCurrentSmEpf();
  if (!epf) redirect('/login');

  const { sites, guards } = await getSMAssignments(epf);

  return <ReportIncidentClient sites={sites} guards={guards} />;
}
