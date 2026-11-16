import type { FoodLike } from './types';

// USDA nutrient ids: 1008 energy (kcal), 2047 and 2048 Atwater energy, 1003 protein, 1005 carbohydrate, 1004 fat
type UsdaNutrient = { nutrientId?: number; value?: number };
type UsdaFood = {
  fdcId: number | string; description?: string; brandOwner?: string; gtinUpc?: string;
  servingSize?: number; servingSizeUnit?: string; householdServingFullText?: string;
  foodNutrients?: UsdaNutrient[];
};

const pick = (nutrients: UsdaNutrient[], ids: number[]) => {
  for (const id of ids) {
    const n = nutrients.find((x) => x.nutrientId === id);
    if (n && typeof n.value === 'number') return n.value;
  }
  return null;
};
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function mapUsdaFood(f: UsdaFood): FoodLike | null {
  const nutrients = f.foodNutrients ?? [];
  const kcal = pick(nutrients, [1008, 2047, 2048]);
  if (kcal == null || !f.description) return null;
  const unit = String(f.servingSizeUnit ?? '').toLowerCase();
  const gramLike = ['g', 'grm', 'ml', 'mlt'].includes(unit); // treats 1 ml as 1 g, a rough rule for drinks
  const serving_g = gramLike && Number(f.servingSize) > 0 ? Number(f.servingSize) : null;
  return {
    source: 'usda', source_id: String(f.fdcId), name: titleCase(f.description),
    brand: f.brandOwner ? titleCase(f.brandOwner) : null, barcode: f.gtinUpc ?? null,
    kcal_100g: kcal, protein_100g: pick(nutrients, [1003]) ?? 0,
    carbs_100g: pick(nutrients, [1005]) ?? 0, fat_100g: pick(nutrients, [1004]) ?? 0,
    serving_g, serving_label: f.householdServingFullText ?? (serving_g ? `${serving_g} g` : null),
  };
}
