import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import UniformIssueClient from './UniformIssueClient';
import { getUniformCatalogForIssue } from '../../lib/uniform-issue/actions';
import { getGuardsForUniformIssue } from '../../lib/uniform-issue/guards';
import { getMyUniformStockOnHand } from '../../lib/uniform-issue/vo-stock';
import type { UniformIssuePortal } from '../../lib/uniform-issue/types';

export default async function UniformIssuePage({
  portal,
  backHref,
  backLabel,
  portalTitle,
}: {
  portal: UniformIssuePortal;
  backHref: string;
  backLabel: string;
  portalTitle: string;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const issuerEpf = user?.email?.split('@')[0].trim().toUpperCase() ?? '';

  const [catalog, guards, stockOnHand] = await Promise.all([
    getUniformCatalogForIssue(),
    getGuardsForUniformIssue(),
    issuerEpf ? getMyUniformStockOnHand(issuerEpf) : [],
  ]);

  return (
    <UniformIssueClient
      catalog={catalog}
      guards={guards}
      stockOnHand={stockOnHand}
      portal={portal}
      backHref={backHref}
      backLabel={backLabel}
      portalTitle={portalTitle}
    />
  );
}
