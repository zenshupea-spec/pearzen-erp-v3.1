export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'tea';

export type SiteMealsProvided = Record<MealType, boolean>;

export const MEAL_TYPE_OPTIONS: { key: MealType; label: string; short: string }[] = [
  { key: 'breakfast', label: 'Breakfast', short: 'BF' },
  { key: 'lunch', label: 'Lunch', short: 'Lunch' },
  { key: 'dinner', label: 'Dinner', short: 'Dinner' },
  { key: 'tea', label: 'Tea', short: 'Tea' },
];

export const EMPTY_SITE_MEALS: SiteMealsProvided = {
  breakfast: false,
  lunch: false,
  dinner: false,
  tea: false,
};

export function anyMealProvided(meals: SiteMealsProvided): boolean {
  return meals.breakfast || meals.lunch || meals.dinner || meals.tea;
}

export function parseSiteMealsFromRow(row: Record<string, unknown>): SiteMealsProvided {
  return {
    breakfast: Boolean(row.meal_breakfast),
    lunch: Boolean(row.meal_lunch),
    dinner: Boolean(row.meal_dinner),
    tea: Boolean(row.meal_tea),
  };
}

export function mealsProvidedSummary(meals: SiteMealsProvided): string {
  const labels = MEAL_TYPE_OPTIONS.filter(({ key }) => meals[key]).map(({ short }) => short);
  return labels.length ? labels.join(', ') : 'None';
}

/** NFC tag UIDs are often stored as two hex segments separated by a colon. */
export function looksLikeNfcTagId(value: string): boolean {
  return /^[0-9a-f]{8,}:[0-9a-f]{8,}$/i.test(value.trim());
}

export function formatSmPhoneDisplay(phone: string): string {
  if (!phone || phone === '—') return '—';
  if (looksLikeNfcTagId(phone)) return '—';
  return phone;
}
