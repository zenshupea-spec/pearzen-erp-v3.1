import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '../../../packages/supabase/server';
import {
  canFetchAuditLedgerTab,
  type PortalTab,
} from './audit-portals';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from './company-context-server';
import {
  fetchBackOfficeUserProfile,
  type BackOfficeUserProfile,
} from './hr-portal-access-server';

export {
  canAccessHqAuditRoute,
  canFetchAuditLedgerTab,
} from './audit-portals';

export class AuditLedgerAccessError extends Error {
  readonly status: 'unauthorized' | 'forbidden';

  constructor(status: 'unauthorized' | 'forbidden', message: string) {
    super(message);
    this.status = status;
  }
}

export type AuditLedgerReadContext = {
  supabase: SupabaseClient;
  profile: BackOfficeUserProfile;
  companyId: string;
  portalTab: PortalTab;
};

export async function assertAuditLedgerReadAccess(
  portalTab?: PortalTab,
): Promise<AuditLedgerReadContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AuditLedgerAccessError('unauthorized', 'Unauthorized');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const tab = portalTab ?? 'hq-staff';

  if (!canFetchAuditLedgerTab(tab, profile)) {
    throw new AuditLedgerAccessError('forbidden', 'Forbidden');
  }

  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) {
    throw new AuditLedgerAccessError('forbidden', 'No company context');
  }

  return { supabase, profile, companyId, portalTab: tab };
}
