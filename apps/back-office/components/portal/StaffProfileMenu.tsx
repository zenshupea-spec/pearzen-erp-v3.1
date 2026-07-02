'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  KeyRound,
  Lock,
  LogOut,
} from 'lucide-react';

import {
  getStaffProfileMenuContextAction,
  type StaffProfileMenuData,
} from '../../app/actions/portal-profile-actions';
import {
  getHeadOfficePortalSessionContextAction,
  invalidatePortalIdleLockAction,
  signOutHeadOfficePortalAction,
} from '../../app/actions/portal-session-actions';
import {
  profileExpiryTooltip,
  profileExpiryWarningActive,
  profileFirstName,
  profileInitials,
} from '../../lib/staff-profile-menu-utils';

type StaffProfileMenuProps = {
  data?: StaffProfileMenuData;
  showLockScreen?: boolean;
  onLockScreen?: () => void;
  onSignOut?: () => void | Promise<void>;
  className?: string;
};

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

function RankPill({ rank }: { rank: string | null }) {
  if (!rank) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-indigo-700">
      {rank}
    </span>
  );
}

function ProfileAvatar({
  data,
  sizeClass,
  imageClass,
  showExpiryDot,
}: {
  data: StaffProfileMenuData;
  sizeClass: string;
  imageClass: string;
  showExpiryDot: boolean;
}) {
  const initials = profileInitials(data.fullName, data.rank);
  const expiryTitle = profileExpiryTooltip(data.daysUntilExpiry);

  return (
    <span className={`relative inline-flex shrink-0 ${sizeClass}`}>
      {data.idPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.idPhotoUrl}
          alt=""
          className={`rounded-full object-cover ring-2 ring-indigo-100 ${imageClass}`}
        />
      ) : (
        <span
          className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 font-black uppercase text-white ring-2 ring-indigo-100 ${imageClass}`}
        >
          {initials}
        </span>
      )}
      {showExpiryDot ? (
        <span
          title={expiryTitle ?? 'Password expiring soon'}
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400"
        />
      ) : null}
    </span>
  );
}

function MenuItems({
  changePasswordHref,
  showLockScreen,
  onLockScreen,
  onSignOut,
  onNavigate,
  isPending,
}: {
  changePasswordHref: string;
  showLockScreen: boolean;
  onLockScreen: () => void;
  onSignOut: () => void;
  onNavigate: () => void;
  isPending: boolean;
}) {
  const itemClass =
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';

  return (
    <ul className="space-y-1 p-1" role="menu">
      {showLockScreen ? (
        <li role="none">
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              onNavigate();
              onLockScreen();
            }}
          >
            <Lock className="h-4 w-4 text-slate-500" aria-hidden />
            Lock screen
          </button>
        </li>
      ) : null}
      <li role="none">
        <Link
          href={changePasswordHref}
          role="menuitem"
          className={itemClass}
          onClick={onNavigate}
        >
          <KeyRound className="h-4 w-4 text-slate-500" aria-hidden />
          Change password
        </Link>
      </li>
      <li role="none">
        <button
          type="button"
          role="menuitem"
          className={`${itemClass} text-rose-700 hover:bg-rose-50`}
          disabled={isPending}
          onClick={() => {
            onNavigate();
            onSignOut();
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </li>
    </ul>
  );
}

export default function StaffProfileMenu({
  data: dataProp,
  showLockScreen = true,
  onLockScreen,
  onSignOut,
  className = '',
}: StaffProfileMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const isWideName = useMediaQuery('(min-width: 640px)');

  const [data, setData] = useState<StaffProfileMenuData | null>(dataProp ?? null);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signInPath, setSignInPath] = useState('/login/hq');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (dataProp) {
      setData(dataProp);
      return;
    }

    let cancelled = false;
    (async () => {
      const [profileResult, sessionContext] = await Promise.all([
        getStaffProfileMenuContextAction(),
        getHeadOfficePortalSessionContextAction(),
      ]);
      if (cancelled) return;

      setSignInPath(sessionContext.signInPath);
      if ('error' in profileResult) {
        setLoadError(profileResult.error);
        setData(null);
        return;
      }
      setLoadError(null);
      setData(profileResult);
    })();

    return () => {
      cancelled = true;
    };
  }, [dataProp]);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeMenu, open]);

  const handleLockScreen = useCallback(() => {
    if (onLockScreen) {
      onLockScreen();
      return;
    }
    startTransition(async () => {
      await invalidatePortalIdleLockAction();
    });
  }, [onLockScreen]);

  const handleSignOut = useCallback(() => {
    startTransition(async () => {
      if (onSignOut) {
        await onSignOut();
        return;
      }
      await signOutHeadOfficePortalAction();
      router.replace(signInPath);
      router.refresh();
    });
  }, [onSignOut, router, signInPath]);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen((value) => !value);
    }
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      setOpen(true);
    }
  };

  if (loadError || !data) {
    return null;
  }

  const firstName = profileFirstName(data.fullName);
  const showExpiryDot = profileExpiryWarningActive(data.daysUntilExpiry);
  const triggerName = isDesktop
    ? data.fullName
    : isWideName
      ? firstName
      : null;

  const changePasswordHref =
    pathname && pathname !== '/account/change-password'
      ? `/account/change-password?returnTo=${encodeURIComponent(pathname)}`
      : '/account/change-password';

  const menuPanel = (
    <>
      <div className="border-b border-slate-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <ProfileAvatar
            data={data}
            sizeClass="h-12 w-12"
            imageClass="h-12 w-12 text-sm"
            showExpiryDot={showExpiryDot}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900">
              {data.fullName ?? 'Staff'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <RankPill rank={data.rank} />
            </div>
            {data.subtitleEmail ? (
              <p className="mt-1 truncate text-xs font-medium text-slate-500">
                {data.subtitleEmail}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <MenuItems
        changePasswordHref={changePasswordHref}
        showLockScreen={showLockScreen}
        onLockScreen={handleLockScreen}
        onSignOut={handleSignOut}
        onNavigate={closeMenu}
        isPending={isPending}
      />
    </>
  );

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
        className="inline-flex max-w-[min(100vw-1.5rem,20rem)] items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur-md transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        <ProfileAvatar
          data={data}
          sizeClass={isDesktop ? 'h-11 w-11' : 'h-10 w-10'}
          imageClass={isDesktop ? 'h-11 w-11 text-sm' : 'h-10 w-10 text-xs'}
          showExpiryDot={showExpiryDot}
        />
        <RankPill rank={data.rank} />
        {triggerName ? (
          <span
            className={`truncate text-sm font-bold text-slate-800 ${
              isDesktop ? 'max-w-[140px]' : 'max-w-[80px]'
            }`}
          >
            {triggerName}
          </span>
        ) : null}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && isDesktop ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[210] w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {menuPanel}
        </div>
      ) : null}

      {open && !isDesktop ? (
        <>
          <button
            type="button"
            aria-label="Close profile menu"
            className="fixed inset-0 z-[205] bg-slate-950/40"
            onClick={closeMenu}
          />
          <div
            id={menuId}
            role="menu"
            className="fixed inset-x-0 bottom-0 z-[210] rounded-t-3xl border border-slate-200 bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
          >
            {menuPanel}
          </div>
        </>
      ) : null}
    </div>
  );
}

export type { StaffProfileMenuData, StaffProfileMenuProps };
