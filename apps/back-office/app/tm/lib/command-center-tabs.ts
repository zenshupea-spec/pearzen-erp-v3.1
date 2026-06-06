export type TmCommandCenterTabKey = 'shift-verification' | 'guard-cards';

export const TM_COMMAND_CENTER_TAB_KEYS: TmCommandCenterTabKey[] = [
  'shift-verification',
  'guard-cards',
];

export function tmTabFromSearchParam(value: string | null): TmCommandCenterTabKey {
  if (value && TM_COMMAND_CENTER_TAB_KEYS.includes(value as TmCommandCenterTabKey)) {
    return value as TmCommandCenterTabKey;
  }
  return 'shift-verification';
}

export function tmCommandCenterHref(tab: TmCommandCenterTabKey): string {
  if (tab === 'shift-verification') return '/tm';
  return `/tm?tab=${tab}`;
}
