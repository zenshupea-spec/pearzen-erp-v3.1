'use client';

import { useEffect, useState } from 'react';
import { Shield, Users } from 'lucide-react';
import HeadOfficeMfaPanel from '../../../components/portal/HeadOfficeMfaPanel';
import ExecutiveRecoveryEmailCard, {
  openExecutiveRecoveryEmailSection,
} from '../../../components/portal/ExecutiveRecoveryEmailCard';
import ExecutiveWorkEmailCard from '../../../components/portal/ExecutiveWorkEmailCard';
import {
  ExecutivePageBody,
  ExecutivePageHeader,
  ExecutivePageLiveSubtitle,
  ExecutivePageShell,
} from '../../../components/executive/ExecutivePageChrome';
import { SettingsTraceability } from '../settings/settings-section-ui';
import { getSettingsAuditTrail } from '../settings/settings-traceability-actions';
import type { SettingsSectionAudit } from '../settings/settings-traceability-actions';
import StaffCommandCenter from '../settings/StaffCommandCenter';
import {
  SecuritySessionsPanel,
  VaultPinConfigPanel,
  AfterHoursLoginAlertsPanel,
  PortalSecurityNotificationsPanel,
  PortalLoginHistoryPanel,
} from '../settings/security-access-panels';

export default function ExecutiveAccessPage() {
  const [rbacAudit, setRbacAudit] = useState<SettingsSectionAudit | undefined>();

  useEffect(() => {
    getSettingsAuditTrail().then((trail) => {
      setRbacAudit(trail.portalRbac);
    });
  }, []);

  useEffect(() => {
    if (window.location.hash !== '#vault-pin') return;
    const scrollToVaultPin = () => {
      document.getElementById('vault-pin')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    };
    scrollToVaultPin();
    window.setTimeout(scrollToVaultPin, 150);
  }, []);

  useEffect(() => {
    if (window.location.hash !== '#recovery-email') return;
    openExecutiveRecoveryEmailSection();
  }, []);

  return (
    <ExecutivePageShell>
      <ExecutivePageHeader
        title="Security & Access"
        subtitle={
          <ExecutivePageLiveSubtitle>
            MFA · Sessions · OTP alerts · Login history · Staff permissions
          </ExecutivePageLiveSubtitle>
        }
      />

      <ExecutivePageBody spacing="relaxed">
        <section className="space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-200/70 pb-2">
            <Shield className="h-4 w-4 text-[color:var(--cvs-accent)]" />
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Security &amp; Access Control
            </h2>
          </div>
          <HeadOfficeMfaPanel showTraceability Traceability={SettingsTraceability} />
          <ExecutiveRecoveryEmailCard />
          <ExecutiveWorkEmailCard />
          <AfterHoursLoginAlertsPanel />
          <PortalSecurityNotificationsPanel />
          <VaultPinConfigPanel />
          <SecuritySessionsPanel />
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/70 pb-2 pt-2">
            <Users className="h-4 w-4 text-[color:var(--cvs-accent)]" />
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Staff Permissions &amp; Roles
            </h2>
          </div>
          <StaffCommandCenter audit={rbacAudit} />
        </section>

        <section className="space-y-4 pt-2">
          <PortalLoginHistoryPanel />
        </section>
      </ExecutivePageBody>
    </ExecutivePageShell>
  );
}
