import OmCommandShellLayout from './OmCommandShellLayout';

export type { OmAccent } from './OmCommandShellLayout';

export default async function OmCommandShell(
  props: React.ComponentProps<typeof OmCommandShellLayout>,
) {
  return <OmCommandShellLayout {...props} />;
}
