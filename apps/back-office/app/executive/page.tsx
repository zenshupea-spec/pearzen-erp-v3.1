import { redirect } from 'next/navigation';

import { EXECUTIVE_DESK_PATH } from '../../lib/hq-hub';

/** /executive root — MD/OD Executive Vault entry. */
export default function ExecutivePage() {
  redirect(EXECUTIVE_DESK_PATH);
}
