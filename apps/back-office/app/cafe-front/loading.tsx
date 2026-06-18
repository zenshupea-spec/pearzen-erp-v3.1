import PortalLoadingScreen from '../../../../packages/pwa-shell/PortalLoadingScreen';

export default function CafeFrontLoading() {
  return (
    <PortalLoadingScreen
      accent="amber"
      fullscreen={false}
      className="min-h-[100dvh]"
    />
  );
}
