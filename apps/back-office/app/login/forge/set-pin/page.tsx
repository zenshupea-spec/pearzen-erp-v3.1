import ForgeGateShell from '../../../../components/portal/ForgeGateShell';
import ForgeSetPinForm from './ForgeSetPinForm';

export default function ForgeSetPinPage() {
  return (
    <ForgeGateShell
      title="Set login password"
      subtitle="Choose a permanent login password to continue."
    >
      <ForgeSetPinForm />
    </ForgeGateShell>
  );
}
