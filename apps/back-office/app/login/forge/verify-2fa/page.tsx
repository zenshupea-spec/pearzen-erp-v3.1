import ForgeGateShell from '../../../../components/portal/ForgeGateShell';
import ForgeVerify2faForm from './ForgeVerify2faForm';

export default function ForgeVerify2faPage() {
  return (
    <ForgeGateShell
      title="Two-factor check"
      subtitle="Enter your authenticator or a one-time backup key."
    >
      <ForgeVerify2faForm />
    </ForgeGateShell>
  );
}
