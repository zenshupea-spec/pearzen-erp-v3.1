import { Users } from 'lucide-react';
import OmCommandShell from '../../components/OmCommandShell';
import SiteAllocationTab from '../../components/SiteAllocationTab';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Guards → Sites | OM Portal',
};

export default function OmSiteGuardAllocationPage() {
  return (
    <OmCommandShell
      title="Guards → Sites"
      subtitle="Assign guards to site slots from the live pool — updates MNR site field and SM links when the site has an SM"
      icon={Users}
      accent="indigo"
      maxWidth="wide"
    >
      <SiteAllocationTab />
    </OmCommandShell>
  );
}
