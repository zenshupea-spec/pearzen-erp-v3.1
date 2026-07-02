'use client';

import { PortalSessionControls } from '../portal/PortalSessionProvider';

/** Idle countdown + staff profile for HQ hub sticky bars and Master Hub header. */
export default function HqPortalSessionBar() {
  return <PortalSessionControls variant="inline" />;
}
