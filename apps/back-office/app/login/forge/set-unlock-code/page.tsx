import ForgeGateShell from '../../../../components/portal/ForgeGateShell';
import ForgeSetUnlockCodeForm from './ForgeSetUnlockCodeForm';

export default function ForgeSetUnlockCodePage() {
  return (
    <ForgeGateShell
      title="Set unlock code"
      subtitle="Separate from your login password — for idle lock only."
    >
      <ForgeSetUnlockCodeForm />
    </ForgeGateShell>
  );
}
