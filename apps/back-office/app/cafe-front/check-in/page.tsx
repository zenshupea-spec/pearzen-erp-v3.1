'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import { CafeFrontSessionGate } from '../../../components/cafe-front/CafeFrontSessionGate';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import {
  CAFE_FRONT_COMPLIANCE_PATH,
  CAFE_FRONT_ORDERS_PATH,
} from '../cafe-front-nav';

/**
 * Stable deep link for shift check-in. The GPS + selfie flow lives in the portal
 * shell gate — not a bottom-nav tab. Before check-in, any café route shows the gate;
 * after check-in, this bookmark lands on a short “already on shift” note.
 */
export default function CafeFrontCheckinPage() {
  return (
    <CafeFrontSessionGate subtitle="Shift check-in · portal gate (not a bottom tab)">
      {() => <CheckinDeepLinkLanding />}
    </CafeFrontSessionGate>
  );
}

function CheckinDeepLinkLanding() {
  return (
    <ExecutiveGlassCard className="p-6 text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" strokeWidth={2} />
      <p className="mt-3 text-sm font-bold text-slate-900">You&apos;re already on shift</p>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-600">
        Shift check-in unlocks the café portal when you arrive — it is not listed in the
        bottom bar. Use this bookmark before your first check-in of the day; once verified,
        open Desk or Orders from the tabs below.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link
          href={CAFE_FRONT_COMPLIANCE_PATH}
          className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-800"
        >
          Compliance desk
        </Link>
        <Link
          href={CAFE_FRONT_ORDERS_PATH}
          className="inline-flex rounded-xl bg-amber-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white"
        >
          Order queue
        </Link>
      </div>
    </ExecutiveGlassCard>
  );
}
