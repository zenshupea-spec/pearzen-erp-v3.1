'use client';

import { CafeFrontSessionGate } from '../../../components/cafe-front/CafeFrontSessionGate';
import { OrderQueuePanel } from '../../../components/cafe-front/OrderQueuePanel';

export default function CafeFrontOrdersPage() {
  return (
    <CafeFrontSessionGate subtitle="Customer orders · first-come queue · prep time tracking">
      {(session) => <OrderQueuePanel shiftGate={session.shiftGate} />}
    </CafeFrontSessionGate>
  );
}
