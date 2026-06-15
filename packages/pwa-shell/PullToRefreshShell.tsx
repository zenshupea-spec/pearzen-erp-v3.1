'use client';

import { useEffect, useRef, useState } from 'react';

const PULL_THRESHOLD = 72;
const MAX_PULL = 100;

function getWindowScrollTop(): number {
  return (
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

function findNestedScrollParent(target: Element | null, stopAt: Element): HTMLElement | null {
  let node = target;
  while (node && node !== stopAt) {
    if (node instanceof HTMLElement) {
      const { overflowY } = getComputedStyle(node);
      if (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight + 1
      ) {
        return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

function isAtScrollTop(container: HTMLElement, nested: HTMLElement | null): boolean {
  if (getWindowScrollTop() > 1) return false;
  if (container.scrollTop > 1) return false;
  if (nested && nested.scrollTop > 1) return false;
  return true;
}

export default function PullToRefreshShell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const nestedScrollRef = useRef<HTMLElement | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const syncPull = (distance: number) => {
    pullDistanceRef.current = distance;
    setPullDistance(distance);
  };

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    document.documentElement.classList.add('pwa-pull-to-refresh');
    return () => {
      document.documentElement.classList.remove('pwa-pull-to-refresh');
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;

      const target = e.target;
      if (!(target instanceof Node) || !el.contains(target)) return;
      if (target instanceof Element && target.closest('[data-pull-to-refresh-ignore]')) return;

      if (!isAtScrollTop(el, null)) return;

      nestedScrollRef.current = findNestedScrollParent(target as Element, el);
      if (!isAtScrollTop(el, nestedScrollRef.current)) return;

      startYRef.current = e.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
      setIsDragging(true);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;

      const nested = nestedScrollRef.current;
      if (!isAtScrollTop(el, nested)) {
        pullingRef.current = false;
        setIsDragging(false);
        syncPull(0);
        return;
      }

      const clientY = e.touches[0]?.clientY ?? 0;
      const delta = clientY - startYRef.current;
      if (delta <= 0) {
        syncPull(0);
        return;
      }

      e.preventDefault();
      syncPull(Math.min(delta * 0.45, MAX_PULL));
    };

    const finishPull = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      nestedScrollRef.current = null;
      setIsDragging(false);

      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        setRefreshing(true);
        syncPull(PULL_THRESHOLD);
        window.location.reload();
        return;
      }

      syncPull(0);
    };

    const listenerOptions = { capture: true } as const;

    document.addEventListener('touchstart', onTouchStart, { ...listenerOptions, passive: true });
    document.addEventListener('touchmove', onTouchMove, { ...listenerOptions, passive: false });
    document.addEventListener('touchend', finishPull, listenerOptions);
    document.addEventListener('touchcancel', finishPull, listenerOptions);

    return () => {
      document.removeEventListener('touchstart', onTouchStart, listenerOptions);
      document.removeEventListener('touchmove', onTouchMove, listenerOptions);
      document.removeEventListener('touchend', finishPull, listenerOptions);
      document.removeEventListener('touchcancel', finishPull, listenerOptions);
    };
  }, []);

  const readyToRelease = pullDistance >= PULL_THRESHOLD;
  const showIndicator = pullDistance > 0 || refreshing;
  const indicatorHeight = Math.max(pullDistance, refreshing ? PULL_THRESHOLD : 0);

  return (
    <main
      ref={containerRef}
      className={`relative flex min-h-[100dvh] w-full max-w-md flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain touch-pan-y ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
        style={{
          height: indicatorHeight,
          opacity: showIndicator ? 1 : 0,
          transition: isDragging ? undefined : 'height 180ms ease, opacity 180ms ease',
        }}
        aria-hidden
      >
        <div
          className={`mt-2 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm ${
            refreshing || readyToRelease ? 'animate-spin' : ''
          }`}
          style={{
            transform: refreshing
              ? undefined
              : `rotate(${Math.min(pullDistance / PULL_THRESHOLD, 1) * 180}deg)`,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 5v14" />
            <path d="m19 12-7 7-7-7" />
          </svg>
        </div>
      </div>
      {children}
    </main>
  );
}
