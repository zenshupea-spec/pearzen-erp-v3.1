import { redirect } from 'next/navigation';
import { getCurrentSmEpf, getSMAssignments } from '../../../lib/sm-assignments';
import { getPenaltyCatalogForSM } from './actions';
import IssuePenaltyClient from './IssuePenaltyClient';

export const dynamic = 'force-dynamic';

export default async function IssuePenaltyPage() {
  const epf = await getCurrentSmEpf();
  if (!epf) redirect('/login');

  const [catalog, { guards }] = await Promise.all([
    getPenaltyCatalogForSM(),
    getSMAssignments(epf),
  ]);

  return <IssuePenaltyClient catalog={catalog} guards={guards} />;
}
