'use client';

import { CafeFrontSessionGate } from '../../../components/cafe-front/CafeFrontSessionGate';

/** Check-in is handled by the portal shell gate — this route keeps a stable URL for bookmarks. */
export default function CafeFrontCheckinPage() {
  return (
    <CafeFrontSessionGate>
      {() => null}
    </CafeFrontSessionGate>
  );
}
