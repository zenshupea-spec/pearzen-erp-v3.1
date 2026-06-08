'use client';

import { CafeFrontSessionGate } from '../../../components/cafe-front/CafeFrontSessionGate';
import { ShiftCheckinPanel } from '../../../components/cafe-front/ShiftCheckinPanel';

export default function CafeFrontCheckinPage() {
  return (
    <CafeFrontSessionGate subtitle="GPS + selfie shift check-in">
      {(session) => <ShiftCheckinPanel shiftGate={session.shiftGate} />}
    </CafeFrontSessionGate>
  );
}
