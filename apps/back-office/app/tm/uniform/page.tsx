import { Shirt } from 'lucide-react';
import UniformIssuePage from '../../../components/uniform-issue/UniformIssuePage';
import TmCommandShellLayout from '../components/TmCommandShellLayout';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Uniform Issue | TM Portal',
  description: 'Issue uniform stock to guards from TM-held VO inventory',
};

export default function TmUniformIssuePage() {
  return (
    <TmCommandShellLayout
      title="Uniform issue"
      subtitle="Issue from TM stock · consent selfie · payroll deduction"
      icon={Shirt}
      iconTone="violet"
      maxWidth="5xl"
      backHref="/tm"
    >
      <UniformIssuePage
        portal="TM"
        backHref="/tm"
        backLabel="Back to TM Command Center"
        portalTitle="TM Command Center"
      />
    </TmCommandShellLayout>
  );
}
