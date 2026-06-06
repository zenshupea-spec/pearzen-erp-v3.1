import { redirect } from 'next/navigation';

import { HQ_HUB_PATH } from '../../lib/hq-hub';

/** /executive root — send MD/OD to the HQ nexus, not straight into CV Operations. */
export default function ExecutivePage() {
  redirect(HQ_HUB_PATH);
}
