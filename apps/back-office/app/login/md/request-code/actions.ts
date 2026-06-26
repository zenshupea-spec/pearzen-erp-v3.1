'use server';

import { requestExecutivePortalAccessCode } from '../../../../lib/head-office-portal-self-service-otp';

export async function requestMdPortalAccessCodeAction(workEmail: string) {
  return requestExecutivePortalAccessCode(workEmail);
}
