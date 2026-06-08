'use client';

import { CafeFrontSessionGate } from '../../../components/cafe-front/CafeFrontSessionGate';
import { RosterLeavePanel } from '../../../components/cafe-front/RosterLeavePanel';

export default function CafeFrontRosterPage() {
  return (
    <CafeFrontSessionGate subtitle="My roster · tap a shift day to request leave">
      {() => <RosterLeavePanel />}
    </CafeFrontSessionGate>
  );
}
