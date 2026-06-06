import OmCommandShell from '../components/OmCommandShell';
import UniformIssuePage from '../../../components/uniform-issue/UniformIssuePage';
import { Shirt } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function OmUniformIssuePage() {
  return (
    <OmCommandShell
      title="Uniform issue"
      subtitle="Issue uniform from stock or request courier delivery — same flow as the SM portal, with guard consent on camera."
      icon={Shirt}
      accent="indigo"
      maxWidth="6xl"
      showSubnav={false}
    >
      <UniformIssuePage
        portal="OM"
        backHref="/om"
        backLabel="Back to OM command center"
        portalTitle="OM Command Center"
      />
    </OmCommandShell>
  );
}
