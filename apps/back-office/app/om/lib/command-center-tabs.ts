export type CommandCenterTabKey =
  | 'tactical'
  | 'site-allocation'
  | 'guard-cards';

export const COMMAND_CENTER_TAB_KEYS: CommandCenterTabKey[] = [
  'tactical',
  'site-allocation',
  'guard-cards',
];

export function tabFromSearchParam(value: string | null): CommandCenterTabKey {
  if (value && COMMAND_CENTER_TAB_KEYS.includes(value as CommandCenterTabKey)) {
    return value as CommandCenterTabKey;
  }
  return 'tactical';
}

export function commandCenterHref(
  tab: CommandCenterTabKey,
  basePath = '/om',
): string {
  if (tab === 'tactical') return basePath;
  return `${basePath}?tab=${tab}`;
}
