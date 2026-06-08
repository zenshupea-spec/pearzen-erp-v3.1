'use client';

import { CafeFrontSessionGate } from '../../components/cafe-front/CafeFrontSessionGate';
import { ComplianceDeskPanel } from '../../components/cafe-front/ComplianceDeskPanel';
import { PrepWastagePanel } from '../../components/cafe-front/PrepWastagePanel';

export default function CafeFrontCompliancePage() {
  return (
    <CafeFrontSessionGate subtitle="Compliance desk · photo uploads for visual task auditor">
      {() => (
        <div className="space-y-6">
          <ComplianceDeskPanel />
          <PrepWastagePanel />
        </div>
      )}
    </CafeFrontSessionGate>
  );
}
