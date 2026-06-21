import ForgeGateShell from '../../../../components/portal/ForgeGateShell';
import SetupForge2faForm from './SetupForge2faForm';

export default function ForgeSetup2faPage() {
  return (
    <ForgeGateShell
      title="Enable 2FA"
      subtitle="Authenticator app required for all Forge sessions."
    >
      <SetupForge2faForm />
    </ForgeGateShell>
  );
}
