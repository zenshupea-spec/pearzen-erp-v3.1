import { UserCircle2 } from 'lucide-react';
import TmCommandShellLayout from '../components/TmCommandShellLayout';
import { getTmMnrPhotoQueue } from './actions';
import MnrPhotoApprovalClient from './MnrPhotoApprovalClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'MNR Photo Approval | TM Portal',
  description: 'Review SM-submitted guard MNR reference photos before shift verification',
};

export default async function TmMnrPhotosPage() {
  const { rows, error } = await getTmMnrPhotoQueue();

  return (
    <TmCommandShellLayout
      title="MNR photo approval"
      subtitle="SM submissions · approve for shift verification or send back to SM"
      icon={UserCircle2}
      iconTone="sky"
      backHref="/tm"
    >
      <MnrPhotoApprovalClient initialRows={rows} loadError={error} />
    </TmCommandShellLayout>
  );
}
