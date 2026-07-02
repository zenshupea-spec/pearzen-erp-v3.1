'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import ForgeSegmentBar, { parseForgeClientSegment } from '../components/ForgeSegmentBar';
import { FORGE_PORTAL_THEME as T } from '../components/forge-portal-theme';
import CustomSoftwareBillingPanel from './CustomSoftwareBillingPanel';
import CustomSoftwareClientsPanel, {
  type CustomSoftwareClientRow,
} from './CustomSoftwareClientsPanel';
import WebsiteClientDetailPanel from './WebsiteClientDetailPanel';
import WebsitePartnerClientsPanel, {
  type WebsitePartnerClientRow,
} from './WebsitePartnerClientsPanel';
import WebsitePartnersPanel, { type WebsitePartnerRow } from './WebsitePartnersPanel';
import WfmBillingPanel from './WfmBillingPanel';
import WfmSubscribersPanel, { type WfmSubscriberRow } from './WfmSubscribersPanel';

function WebsitesSegmentHint() {
  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-xs text-emerald-900">
      Each website client is built from your template gallery, gets a PEARS shop listing, and bills{' '}
      <strong>LKR 10,000</strong> in month one (LKR 5,000 Pearzen · LKR 5,000 manager), then{' '}
      <strong>LKR 5,000/month</strong> (LKR 4,000 Pearzen · LKR 1,000 manager). Select a manager, then
      a client to view their site and billings.
    </div>
  );
}

export default function ForgeClientsPage() {
  const searchParams = useSearchParams();
  const segment = parseForgeClientSegment(searchParams.get('segment'));
  const [selectedWfm, setSelectedWfm] = useState<WfmSubscriberRow | null>(null);
  const [selectedCustom, setSelectedCustom] = useState<CustomSoftwareClientRow | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<WebsitePartnerRow | null>(null);
  const [selectedWebsiteClient, setSelectedWebsiteClient] =
    useState<WebsitePartnerClientRow | null>(null);
  const [customReloadNonce, setCustomReloadNonce] = useState(0);

  useEffect(() => {
    setSelectedWfm(null);
    setSelectedCustom(null);
    setSelectedPartner(null);
    setSelectedWebsiteClient(null);
  }, [segment]);

  useEffect(() => {
    setSelectedWebsiteClient(null);
  }, [selectedPartner?.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Client hub</h1>
        <p className={`mt-1 ${T.sectionDesc}`}>
          Your Pearzen.tech overwatch — WFM subscribers, custom software builds, and web managers
          with their website clients.
        </p>
      </div>

      <ForgeSegmentBar active={segment} />

      {segment === 'wfm' ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <WfmSubscribersPanel
            selectedId={selectedWfm?.id ?? null}
            onSelect={setSelectedWfm}
          />
          {selectedWfm ? (
            <WfmBillingPanel subscriber={selectedWfm} onClose={() => setSelectedWfm(null)} />
          ) : null}
        </div>
      ) : segment === 'custom' ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <CustomSoftwareClientsPanel
            selectedId={selectedCustom?.id ?? null}
            onSelect={setSelectedCustom}
            reloadNonce={customReloadNonce}
          />
          {selectedCustom ? (
            <CustomSoftwareBillingPanel
              client={selectedCustom}
              onClose={() => setSelectedCustom(null)}
              onUpdated={() => setCustomReloadNonce((value) => value + 1)}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <WebsitesSegmentHint />
          <div
            className={`grid grid-cols-1 gap-6 ${
              selectedPartner ? 'xl:grid-cols-[minmax(0,1fr)_380px]' : ''
            }`}
          >
            <WebsitePartnersPanel
              selectedId={selectedPartner?.id ?? null}
              onSelect={setSelectedPartner}
            />
            {selectedPartner ? (
              <WebsitePartnerClientsPanel
                partner={selectedPartner}
                selectedId={selectedWebsiteClient?.id ?? null}
                onSelect={setSelectedWebsiteClient}
                onClose={() => {
                  setSelectedPartner(null);
                  setSelectedWebsiteClient(null);
                }}
              />
            ) : null}
          </div>
          {selectedPartner && selectedWebsiteClient ? (
            <WebsiteClientDetailPanel
              partner={selectedPartner}
              client={selectedWebsiteClient}
              onClose={() => setSelectedWebsiteClient(null)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
