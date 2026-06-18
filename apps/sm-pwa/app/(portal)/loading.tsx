import PortalLoadingScreen from '../../../../packages/pwa-shell/PortalLoadingScreen';

export default function SmPortalLoading() {
  return (
    <PortalLoadingScreen
      accent="amber"
      fullscreen={false}
      className="min-h-[100dvh]"
    />
  );
}
