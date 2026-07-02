import { revalidatePath } from 'next/cache';

/** Routes that read `md_settings` or derived getters (Audit §1.13.4, §2.1.5). */
export const MD_SETTINGS_CONSUMER_PATHS = [
  '/executive/settings',
  '/fm',
  '/fm/batch',
  '/invoice-desk',
  '/hr/onboarding',
] as const;

/** Call after every successful MD settings save (column path or envelope fallback). */
export function revalidateMdSettingsConsumers(): void {
  for (const path of MD_SETTINGS_CONSUMER_PATHS) {
    revalidatePath(path);
  }
}
