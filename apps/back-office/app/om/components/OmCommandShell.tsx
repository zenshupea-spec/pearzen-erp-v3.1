import HqHubBackLink from '../../../components/hq/HqHubBackLink';
import OmCommandShellLayout from './OmCommandShellLayout';

export type { OmAccent } from './OmCommandShellLayout';

const HQ_BACK_LINK_CLASS =
  'inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 sm:px-3 sm:text-xs';

export default async function OmCommandShell(
  props: React.ComponentProps<typeof OmCommandShellLayout>,
) {
  return (
    <OmCommandShellLayout
      {...props}
      hqBackLink={<HqHubBackLink className={HQ_BACK_LINK_CLASS} />}
    />
  );
}
