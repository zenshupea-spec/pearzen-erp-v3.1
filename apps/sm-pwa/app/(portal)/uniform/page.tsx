import { redirect } from 'next/navigation';
import { getCurrentSmEpf, getSMAssignments } from '../../../lib/sm-assignments';
import { getMyUniformStockForSM, getUniformCatalogForSM } from './actions';
import UniformRequestClient from './UniformRequestClient';

export const dynamic = 'force-dynamic';

export default async function UniformRequestPage() {
  const epf = await getCurrentSmEpf();
  if (!epf) redirect('/login');

  const [catalog, { guards }, stockOnHand] = await Promise.all([
    getUniformCatalogForSM(),
    getSMAssignments(epf),
    getMyUniformStockForSM(),
  ]);

  return <UniformRequestClient catalog={catalog} guards={guards} stockOnHand={stockOnHand} />;
}
