/** DOM events that count as user activity for portal idle-lock timers. */
export const PORTAL_IDLE_ACTIVITY_EVENTS = [
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const;

/** Bind capture-phase listeners so scrolling/typing inside nested panes counts. */
export function bindPortalIdleActivity(onActivity: () => void): () => void {
  for (const event of PORTAL_IDLE_ACTIVITY_EVENTS) {
    document.addEventListener(event, onActivity, { passive: true, capture: true });
  }
  return () => {
    for (const event of PORTAL_IDLE_ACTIVITY_EVENTS) {
      document.removeEventListener(event, onActivity, { capture: true });
    }
  };
}
