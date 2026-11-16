export const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
  { key: 'pre_workout', label: 'Pre-workout' },
  { key: 'post_workout', label: 'Post-workout' },
] as const;

export type MealKey = (typeof MEALS)[number]['key'];

export const isMealKey = (s: string | null): s is MealKey => MEALS.some((m) => m.key === s);

export const mealLabel = (k: string) => MEALS.find((m) => m.key === k)?.label ?? k;
