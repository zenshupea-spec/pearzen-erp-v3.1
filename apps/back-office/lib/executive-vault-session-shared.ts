/** True when a settings write was blocked by the vault PIN gate. Client-safe. */
export function isVaultLockSaveError(error: string | undefined | null): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes('vault is locked') ||
    normalized.includes('vault pin is not configured')
  );
}
