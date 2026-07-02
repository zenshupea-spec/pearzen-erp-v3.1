/** Keep in sync with packages/supabase/cvs-database-backup.ts (script-side copy). */

export const CVS_SUPABASE_PROJECT_REF = 'ktfgvcrdfbapmefktgjc';
export const CVS_SUPABASE_ORG_ID = 'ennbhatdmdwmuzwcjkax';
export const CVS_DATABASE_BACKUP_BUCKET = 'cvs-database-backups';
export const CVS_DATABASE_BACKUP_RETENTION_DAYS = 30;
export const CVS_LOGICAL_BACKUP_MAX_AGE_HOURS = 25;
export const CVS_PITR_RPO_MINUTES = 2;
export const CVS_PITR_RTO_HOURS = 1;

export function buildCvsDatabaseBackupObjectKey(isoDate = new Date()) {
  const y = isoDate.getUTCFullYear();
  const m = String(isoDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(isoDate.getUTCDate()).padStart(2, '0');
  const stamp = `${y}${m}${d}T${String(isoDate.getUTCHours()).padStart(2, '0')}${String(isoDate.getUTCMinutes()).padStart(2, '0')}${String(isoDate.getUTCSeconds()).padStart(2, '0')}Z`;
  return `cvs/${y}/${m}/${d}/postgres-${stamp}.sql.gz`;
}

export function parseCvsDatabaseBackupObjectKey(key) {
  const match = key.match(/postgres-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.sql\.gz$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`);
}

export function cvsDatabaseBackupKeysToPrune(
  keys,
  retentionDays = CVS_DATABASE_BACKUP_RETENTION_DAYS,
  referenceDate = new Date(),
) {
  const cutoff = new Date(referenceDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return keys.filter((key) => {
    const parsed = parseCvsDatabaseBackupObjectKey(key);
    return parsed !== null && parsed < cutoff;
  });
}

export function isLogicalBackupFresh(
  latestBackupAt,
  maxAgeHours = CVS_LOGICAL_BACKUP_MAX_AGE_HOURS,
  now = new Date(),
) {
  if (!latestBackupAt) return false;
  return now.getTime() - latestBackupAt.getTime() <= maxAgeHours * 60 * 60 * 1000;
}

export function latestBackupFromObjectKeys(keys) {
  let latest = null;
  for (const key of keys) {
    const parsed = parseCvsDatabaseBackupObjectKey(key);
    if (!parsed) continue;
    if (!latest || parsed > latest) latest = parsed;
  }
  return latest;
}

export function assessCvsDatabaseBackupPosture({ orgPlan, pitrEnabled, latestLogicalBackupAt }) {
  if (pitrEnabled) {
    return {
      compliant: true,
      path: 'pitr',
      reasons: ['PITR enabled — platform WAL recovery (RPO ~2 min)'],
    };
  }

  const reasons = [];
  if (orgPlan === 'free') {
    reasons.push(
      'Supabase org on Free plan — use nightly logical dumps until Pro + PITR is funded',
    );
  } else {
    reasons.push('Pro org without PITR — enable add-on or maintain logical dumps');
  }

  const fresh = isLogicalBackupFresh(latestLogicalBackupAt);
  if (!fresh) {
    reasons.push('No logical dump within 25h — run npm run backup:cvs-database');
  }

  return { compliant: fresh, path: 'logical_dump', reasons };
}
