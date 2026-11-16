import { supabase } from './supabase';
import { currentUserId } from './api';
import { scale } from './nutrition';
import { newId, saveEntry } from './offlineQueue';
import type { Entry, FoodLike } from './types';
import type { MealKey } from './constants';

const FOOD_COLUMNS =
  'id, source, source_id, name, brand, barcode, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g, serving_label';

export const normalizeFood = (f: Record<string, unknown>): FoodLike => ({
  id: f.id as string | undefined,
  source: f.source as FoodLike['source'],
  source_id: (f.source_id as string | null) ?? null,
  name: String(f.name),
  brand: (f.brand as string | null) ?? null,
  barcode: (f.barcode as string | null) ?? null,
  kcal_100g: Number(f.kcal_100g),
  protein_100g: Number(f.protein_100g),
  carbs_100g: Number(f.carbs_100g),
  fat_100g: Number(f.fat_100g),
  serving_g: f.serving_g == null ? null : Number(f.serving_g),
  serving_label: (f.serving_label as string | null) ?? null,
});

// Saves a search result into your own foods the first time you log it, and returns the saved row
export async function ensureSaved(food: FoodLike): Promise<FoodLike & { id: string }> {
  if (food.id) return food as FoodLike & { id: string };
  const userId = await currentUserId();
  const { id: _omit, ...row } = food;
  void _omit;
  const { data, error } = await supabase
    .from('foods')
    .upsert({ ...row, user_id: userId }, { onConflict: 'user_id,source,source_id' })
    .select(FOOD_COLUMNS)
    .single();
  if (error) throw error;
  return normalizeFood(data) as FoodLike & { id: string };
}

export async function logFood(food: FoodLike, grams: number, meal: MealKey, date: string) {
  const saved = await ensureSaved(food);
  const userId = await currentUserId();
  return saveEntry({
    id: newId(), user_id: userId, entry_date: date, meal, food_id: saved.id, grams,
    name: saved.brand ? `${saved.name} (${saved.brand})` : saved.name,
    ...scale(saved, grams),
  });
}

export async function logQuickAdd(opts: {
  meal: MealKey; date: string; name: string; kcal: number; protein: number; carbs: number; fat: number;
}) {
  const userId = await currentUserId();
  return saveEntry({
    id: newId(), user_id: userId, entry_date: opts.date, meal: opts.meal, food_id: null, grams: null,
    name: opts.name || 'Quick add', kcal: opts.kcal, protein_g: opts.protein, carbs_g: opts.carbs, fat_g: opts.fat,
  });
}

export async function copyDay(fromDate: string, toDate: string, meal?: MealKey) {
  let q = supabase
    .from('food_entries')
    .select('food_id, meal, name, grams, kcal, protein_g, carbs_g, fat_g')
    .eq('entry_date', fromDate);
  if (meal) q = q.eq('meal', meal);
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) return 0;
  const userId = await currentUserId();
  const rows = data.map((r) => ({ ...r, id: newId(), user_id: userId, entry_date: toDate }));
  const { error: insertError } = await supabase.from('food_entries').insert(rows);
  if (insertError) throw insertError;
  return rows.length;
}

export async function deleteEntry(id: string) {
  const { error } = await supabase.from('food_entries').delete().eq('id', id);
  if (error) throw error;
}

export async function restoreEntry(e: Entry) {
  const userId = await currentUserId();
  const { pending: _p, created_at: _c, ...row } = e;
  void _p; void _c;
  const { error } = await supabase.from('food_entries').upsert({ ...row, user_id: userId }, { onConflict: 'id' });
  if (error) throw error;
}

export async function updateEntryGrams(e: Entry, grams: number) {
  if (!e.grams || e.grams <= 0) throw new Error('This entry has no weight to scale');
  const f = grams / e.grams;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const patch = { grams, kcal: r1(e.kcal * f), protein_g: r1(e.protein_g * f), carbs_g: r1(e.carbs_g * f), fat_g: r1(e.fat_g * f) };
  const { error } = await supabase.from('food_entries').update(patch).eq('id', e.id);
  if (error) throw error;
}

export async function updateQuickEntry(id: string, patch: { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }) {
  const { error } = await supabase.from('food_entries').update(patch).eq('id', id);
  if (error) throw error;
}

export { FOOD_COLUMNS };
