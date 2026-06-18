import { UserCheck } from 'lucide-react';
import OmCommandShell from '../../components/OmCommandShell';
import { getOmSmGuardAssignmentData } from '../../actions/sm-guard-assignments';
import SmGuardAssignmentWorkbench from './SmGuardAssignmentWorkbench';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Guards → SM | OM Portal',
};

export default async function OmGuardSmAssignmentsPage() {
  const data = await getOmSmGuardAssignmentData();

  return (
    <OmCommandShell
      title="Guards → Sector Manager"
      subtitle="Link guards to SMs for the SM portal roster — assign when missing from MNR or reassign"
      icon={UserCheck}
      accent="indigo"
      maxWidth="wide"
    >
      <SmGuardAssignmentWorkbench
        initialRows={data.rows}
        initialManagers={data.managers}
        initialCounts={data.counts}
      />
    </OmCommandShell>
  );
}
