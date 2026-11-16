import type { Per100 } from './types';

const round1 = (x: number) => Math.round(x * 10) / 10;

// Nutrition for a weight of food
export const scale = (f: Per100, grams: number) => ({
  kcal: round1((f.kcal_100g * grams) / 100),
  protein_g: round1((f.protein_100g * grams) / 100),
  carbs_g: round1((f.carbs_100g * grams) / 100),
  fat_g: round1((f.fat_100g * grams) / 100),
});

// Label numbers (per serving) to per-100 g values, for custom foods
export const fromServing = (
  n: { kcal: number; protein: number; carbs: number; fat: number },
  servingG: number
): Per100 => ({
  kcal_100g: (n.kcal / servingG) * 100,
  protein_100g: (n.protein / servingG) * 100,
  carbs_100g: (n.carbs / servingG) * 100,
  fat_100g: (n.fat / servingG) * 100,
});

// A recipe becomes one food: totals divided by the cooked weight
export function recipeNutrition(items: { food: Per100; grams: number }[], servings: number, cookedWeightG?: number) {
  const raw = items.reduce((s, i) => s + i.grams, 0);
  const weight = cookedWeightG && cookedWeightG > 0 ? cookedWeightG : raw;
  const total = items.reduce(
    (a, i) => ({
      kcal: a.kcal + (i.food.kcal_100g * i.grams) / 100,
      protein: a.protein + (i.food.protein_100g * i.grams) / 100,
      carbs: a.carbs + (i.food.carbs_100g * i.grams) / 100,
      fat: a.fat + (i.food.fat_100g * i.grams) / 100,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const per100 = (x: number) => (weight > 0 ? (x / weight) * 100 : 0);
  return {
    kcal_100g: per100(total.kcal), protein_100g: per100(total.protein),
    carbs_100g: per100(total.carbs), fat_100g: per100(total.fat),
    serving_g: weight / Math.max(servings, 1), total,
  };
}
