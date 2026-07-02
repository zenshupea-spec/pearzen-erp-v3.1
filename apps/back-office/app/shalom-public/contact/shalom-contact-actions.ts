'use server';

import { submitShalomContactInquiryFromPayload } from '../../../lib/shalom-public-contact-server';
import type { ShalomContactInquiryActionResult } from '../../../lib/shalom-public-contact';

export async function submitShalomContactInquiryAction(
  payload: unknown,
): Promise<ShalomContactInquiryActionResult> {
  return submitShalomContactInquiryFromPayload(payload);
}
