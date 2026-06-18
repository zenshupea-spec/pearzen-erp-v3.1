import { UserCheck } from 'lucide-react';
import OmCommandShell from '../../components/OmCommandShell';
import {
  getSectorManagersForAssignment,
  getSitesPendingSmAssignment,
  getSitesWithSmAssigned,
} from '../../actions/sites';
import SiteSmAssignmentWorkbench from './SiteSmAssignmentWorkbench';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Sites → SM | OM Portal',
};

export default async function OmSiteAssignmentsPage() {
  const [livePending, liveAssigned, liveManagers] = await Promise.all([
    getSitesPendingSmAssignment(),
    getSitesWithSmAssigned(),
    getSectorManagersForAssignment(),
  ]);
  return (
    <OmCommandShell
      title="Sites → Sector Manager"
      subtitle="Assign pending sites to SMs or reassign existing site ownership"
      icon={UserCheck}
      accent="indigo"
      maxWidth="6xl"
    >
      <SiteSmAssignmentWorkbench
        initialPending={livePending}
        initialAssigned={liveAssigned}
        initialManagers={liveManagers}
        isDemo={false}
      />
    </OmCommandShell>
  );
}
