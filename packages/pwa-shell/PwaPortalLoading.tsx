import PortalLoadingScreen, {
  type PortalLoadingAccent,
} from './PortalLoadingScreen';

export type PwaPortalId =
  | 'cafe-front'
  | 'shalom-front'
  | 'field-pwa'
  | 'sm-pwa'
  | 'client-pwa';

const PORTAL_ACCENT: Record<PwaPortalId, PortalLoadingAccent> = {
  'cafe-front': 'amber',
  'shalom-front': 'emerald',
  'field-pwa': 'slate',
  'sm-pwa': 'amber',
  'client-pwa': 'emerald',
};

/** Branded loader for café front · Shalom · guard · SM · client PWAs. */
export default function PwaPortalLoading({
  portal,
  message = 'Loading…',
  className = '',
  overlay = false,
  fullscreen = false,
}: {
  portal: PwaPortalId;
  message?: string;
  className?: string;
  overlay?: boolean;
  fullscreen?: boolean;
}) {
  return (
    <PortalLoadingScreen
      label={message}
      accent={PORTAL_ACCENT[portal]}
      overlay={overlay}
      fullscreen={fullscreen}
      scrim={overlay || fullscreen}
      className={className || (overlay || fullscreen ? '' : 'min-h-[min(100dvh,16rem)] py-12')}
    />
  );
}
