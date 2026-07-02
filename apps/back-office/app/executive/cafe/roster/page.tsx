import { redirect } from 'next/navigation';

import { CAFE_COMPLIANCE_PATH } from '../cafe-portal-nav';

/** Legacy deep link — labor roster moved to HR → Café Roster. */
export default function CafeRosterDeepLinkPage() {
  redirect(CAFE_COMPLIANCE_PATH);
}
