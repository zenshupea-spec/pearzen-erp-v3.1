import { redirect } from 'next/navigation';

import { EXECUTIVE_DESK_PATH } from '../../lib/hq-hub';

/** /executive root — MD/OD CV Operations (live field radar). */
export default function ExecutivePage() {
  redirect(EXECUTIVE_DESK_PATH);
}
