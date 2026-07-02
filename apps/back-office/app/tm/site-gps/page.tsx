import { MapPin } from 'lucide-react';
import TmCommandShellLayout from '../components/TmCommandShellLayout';
import { getTmSiteGpsQueue } from './actions';
import SiteGpsApprovalClient from './SiteGpsApprovalClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Site GPS Approval | TM Portal',
  description: 'Review SM-submitted site GPS coordinates before updating the site directory',
};

export default async function TmSiteGpsPage() {
  const { rows, error } = await getTmSiteGpsQueue();

  return (
    <TmCommandShellLayout
      title="Site GPS approval"
      subtitle="SM field submissions · approve to site directory or send back to SM"
      icon={MapPin}
      iconTone="emerald"
      backHref="/tm"
    >
      <SiteGpsApprovalClient initialRows={rows} loadError={error} />
    </TmCommandShellLayout>
  );
}
