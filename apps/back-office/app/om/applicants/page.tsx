import { ClipboardList } from 'lucide-react';

import OmCommandShell from '../components/OmCommandShell';
import ApplicantsWorkbench from './ApplicantsWorkbench';
import { getGuardJobApplicants } from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Applicants | OM Portal',
};

export default async function OmApplicantsPage() {
  const { applicants, error } = await getGuardJobApplicants();

  return (
    <OmCommandShell
      title="Applicants"
      subtitle="Public careers applications — documents, contact numbers, and review status"
      icon={ClipboardList}
      accent="indigo"
      maxWidth="6xl"
    >
      {error ? (
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {error}
        </p>
      ) : null}
      <ApplicantsWorkbench initialApplicants={applicants} />
    </OmCommandShell>
  );
}
