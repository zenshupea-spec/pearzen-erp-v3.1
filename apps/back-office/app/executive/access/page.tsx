'use client';

import { useEffect, useState } from 'react';
import { Shield, Users } from 'lucide-react';
import HeadOfficeMfaPanel from '../../../components/portal/HeadOfficeMfaPanel';
import { SettingsTraceability } from '../settings/settings-section-ui';
import { getSettingsAuditTrail } from '../settings/settings-traceability-actions';
import type { SettingsSectionAudit } from '../settings/settings-traceability-actions';
import {
  RbacMatrixPanel,
  SecuritySessionsPanel,
  VaultPinConfigPanel,
} from '../settings/security-access-panels';

export default function ExecutiveAccessPage() {
  const [rbacAudit, setRbacAudit] = useState<SettingsSectionAudit | undefined>();

  useEffect(() => {
    getSettingsAuditTrail().then((trail) => {
      setRbacAudit(trail.portalRbac);
    });
  }, []);

  return (
    <div className="min-h-0 pb-24 font-sans">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/45 px-4 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150 md:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/80 bg-indigo-50/80 shadow-sm">
            <Shield className="h-5 w-5 text-indigo-700" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 md:text-2xl">
              Security &amp; Access
            </h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 md:text-sm">
              MFA · Vault PIN · Sessions · Staff permissions
            </p>
          </div>
        </div>
      </header>

      <div className="w-full space-y-6 px-4 py-6 md:px-6 lg:px-12 2xl:px-24 md:py-8">
        <section className="space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-200/70 pb-2">
            <Shield className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Security &amp; Access Control
            </h2>
          </div>
          <HeadOfficeMfaPanel showTraceability Traceability={SettingsTraceability} />
          <VaultPinConfigPanel />
          <SecuritySessionsPanel />
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/70 pb-2 pt-2">
            <Users className="h-4 w-4 text-slate-500" />
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Staff Permissions &amp; Roles
            </h2>
          </div>
          <RbacMatrixPanel audit={rbacAudit} />
        </section>
      </div>
    </div>
  );
}
