export type Units = 'lb' | 'kg';

export type Profile = {
  id: string;
  sex: 'male' | 'female' | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  body_fat_pct: number | null;
  neat_level: 'low' | 'moderate' | 'high';
  training_days: number;
  formula: 'mifflin' | 'katch';
  goal: 'cut' | 'maintain' | 'bulk';
  weekly_rate_pct: number;
  target_kcal: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  units: Units;
};

export type Per100 = { kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number };

// A food from your database (has id) or a search result that is not saved yet (no id)
export type FoodLike = Per100 & {
  id?: string;
  source: 'usda' | 'off' | 'custom' | 'recipe';
  source_id: string | null;
  name: string;
  brand: string | null;
  barcode: string | null;
  serving_g: number | null;
  serving_label: string | null;
};

export type Entry = {
  id: string;
  entry_date: string;
  meal: string;
  food_id: string | null;
  name: string;
  grams: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at?: string;
  pending?: boolean;
};

export type WeighIn = { weigh_date: string; weight_kg: number };
