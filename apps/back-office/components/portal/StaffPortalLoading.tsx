import PortalLoadingScreen, {
  type PortalLoadingAccent,
} from '../../../../packages/pwa-shell/PortalLoadingScreen';

export type StaffPortalId = 'hq' | 'hr' | 'fm' | 'om' | 'tm' | 'forge';

const PORTAL_ACCENT: Record<StaffPortalId, PortalLoadingAccent> = {
  hq: 'emerald',
  hr: 'rose',
  fm: 'sky',
  om: 'amber',
  tm: 'slate',
  forge: 'violet',
};

/** Branded in-page loader for HQ · HR · FM · OM · TM · Forge staff portals. */
export default function StaffPortalLoading({
  portal,
  message = 'Loading…',
  className = '',
  overlay = false,
}: {
  portal: StaffPortalId;
  message?: string;
  className?: string;
  overlay?: boolean;
}) {
  return (
    <PortalLoadingScreen
      label={message}
      accent={PORTAL_ACCENT[portal]}
      overlay={overlay}
      fullscreen={false}
      scrim={overlay}
      className={className || (overlay ? '' : 'min-h-[min(100dvh,20rem)]')}
    />
  );
}
