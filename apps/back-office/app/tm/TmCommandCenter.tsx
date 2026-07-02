'use client';

import { useSearchParams } from 'next/navigation';
import { Layers } from 'lucide-react';
import ShiftVerificationTab from '../om/ShiftVerificationTab';
import GuardCardsTab from '../om/guard-cards/GuardCardsTab';
import TerritoryOversightTab from './components/TerritoryOversightTab';
import TmCommandShellLayout from './components/TmCommandShellLayout';
import { tmTabFromSearchParam } from './lib/command-center-tabs';

export default function TmCommandCenter({
  showHqHubLink = false,
}: {
  showHqHubLink?: boolean;
}) {
  const searchParams = useSearchParams();
  const activeTab = tmTabFromSearchParam(searchParams.get('tab'));

  return (
    <TmCommandShellLayout
      title="TM Command Center"
      subtitle="Shift verification, territory oversight, guard performance cards, and site GPS"
      icon={Layers}
      iconTone="violet"
      showHqHubLink={showHqHubLink}
    >
      {activeTab === 'shift-verification' && <ShiftVerificationTab />}
      {activeTab === 'territory' && <TerritoryOversightTab />}
      {activeTab === 'guard-cards' && <GuardCardsTab />}
    </TmCommandShellLayout>
  );
}
