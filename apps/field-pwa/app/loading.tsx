import PortalLoadingScreen from '../../../packages/pwa-shell/PortalLoadingScreen';

export default function GuardPortalLoading() {
  return (
    <PortalLoadingScreen
      accent="slate"
      fullscreen={false}
      className="min-h-[100dvh]"
    />
  );
}
