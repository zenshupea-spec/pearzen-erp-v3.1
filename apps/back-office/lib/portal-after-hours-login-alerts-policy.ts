const COLOMBO_TZ = 'Asia/Colombo';

export type PortalAfterHoursLoginAlertSettings = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  notifyEmails: string[];
};

export const DEFAULT_PORTAL_AFTER_HOURS_LOGIN_ALERT_SETTINGS: PortalAfterHoursLoginAlertSettings =
  {
    enabled: true,
    startTime: '17:00',
    endTime: '08:00',
    notifyEmails: [],
  };

const HHMM_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parsePortalAlertTimeToMinutes(value: string): number | null {
  const match = HHMM_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatPortalAlertMinutesAsTime(minutes: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function colomboMinutesSinceMidnight(at = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COLOMBO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(at));

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function isWithinAfterHoursWindow(
  settings: PortalAfterHoursLoginAlertSettings,
  at = Date.now(),
): boolean {
  if (!settings.enabled) return false;

  const start = parsePortalAlertTimeToMinutes(settings.startTime);
  const end = parsePortalAlertTimeToMinutes(settings.endTime);
  if (start == null || end == null || start === end) return false;

  const now = colomboMinutesSinceMidnight(at);
  if (start < end) {
    return now >= start && now < end;
  }

  return now >= start || now < end;
}

export function normalizeEmailList(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of values ?? []) {
    const email = raw.trim().toLowerCase();
    if (!email || !email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
  }

  return normalized;
}

export function normalizePortalAfterHoursLoginAlertSettings(
  raw: unknown,
): PortalAfterHoursLoginAlertSettings {
  const input =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const startTimeRaw =
    typeof input.startTime === 'string'
      ? input.startTime.trim()
      : DEFAULT_PORTAL_AFTER_HOURS_LOGIN_ALERT_SETTINGS.startTime;
  const endTimeRaw =
    typeof input.endTime === 'string'
      ? input.endTime.trim()
      : DEFAULT_PORTAL_AFTER_HOURS_LOGIN_ALERT_SETTINGS.endTime;

  const startTime =
    parsePortalAlertTimeToMinutes(startTimeRaw) != null
      ? formatPortalAlertMinutesAsTime(parsePortalAlertTimeToMinutes(startTimeRaw)!)
      : DEFAULT_PORTAL_AFTER_HOURS_LOGIN_ALERT_SETTINGS.startTime;
  const endTime =
    parsePortalAlertTimeToMinutes(endTimeRaw) != null
      ? formatPortalAlertMinutesAsTime(parsePortalAlertTimeToMinutes(endTimeRaw)!)
      : DEFAULT_PORTAL_AFTER_HOURS_LOGIN_ALERT_SETTINGS.endTime;

  const notifyEmails = Array.isArray(input.notifyEmails)
    ? normalizeEmailList(input.notifyEmails.map(String))
    : typeof input.notifyEmails === 'string'
      ? normalizeEmailList(input.notifyEmails.split(/[\n,;]+/))
      : [];

  return {
    enabled:
      typeof input.enabled === 'boolean'
        ? input.enabled
        : DEFAULT_PORTAL_AFTER_HOURS_LOGIN_ALERT_SETTINGS.enabled,
    startTime,
    endTime,
    notifyEmails,
  };
}
