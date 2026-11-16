'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { currentUserId } from '@/lib/api';
import { FOOD_COLUMNS, ensureSaved, normalizeFood } from '@/lib/foods';
import { recipeNutrition, scale } from '@/lib/nutrition';
import { newId } from '@/lib/offlineQueue';
import type { FoodLike } from '@/lib/types';
import FoodSearch from './FoodSearch';
import ServingSheet from './ServingSheet';
import Sheet from './Sheet';

type Item = { food: FoodLike; grams: number };

export default function RecipeBuilder() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const recipeFoodId = params.get('id');

  const [name, setName] = useState('');
  const [servings, setServings] = useState('4');
  const [cooked, setCooked] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<FoodLike | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recipeId, setRecipeId] = useState<string | null>(null);

  // Open an existing recipe for editing
  useEffect(() => {
    if (!recipeFoodId) return;
    (async () => {
      const { data: r } = await supabase.from('recipes').select('id, name, servings, cooked_weight_g').eq('food_id', recipeFoodId).maybeSingle();
      if (!r) return setErr('Recipe not found.');
      setRecipeId(r.id); setName(r.name); setServings(String(r.servings));
      setCooked(r.cooked_weight_g ? String(r.cooked_weight_g) : '');
      const { data: rows } = await supabase.from('recipe_items').select(`grams, foods(${FOOD_COLUMNS})`).eq('recipe_id', r.id);
      setItems((rows ?? []).map((row) => {
        const f = (Array.isArray(row.foods) ? row.foods[0] : row.foods) as Record<string, unknown>;
        return { food: normalizeFood(f), grams: Number(row.grams) };
      }));
    })();
  }, [recipeFoodId]);

  const sv = Math.max(1, Number(servings) || 1);
  const cookedG = Number(cooked) > 0 ? Number(cooked) : undefined;
  const calc = items.length ? recipeNutrition(items.map((i) => ({ food: i.food, grams: i.grams })), sv, cookedG) : null;
  const perServing = calc ? scale(calc, calc.serving_g) : null;

  async function save() {
    setErr(null);
    if (!name.trim()) return setErr('Give the recipe a name.');
    if (!calc) return setErr('Add at least one ingredient.');
    setBusy(true);
    try {
      const userId = await currentUserId();
      const saved = await Promise.all(items.map(async (i) => ({ id: (await ensureSaved(i.food)).id, grams: i.grams })));
      const foodRow = {
        id: recipeFoodId ?? newId(), user_id: userId, source: 'recipe', source_id: recipeFoodId ? undefined : newId(),
        name: name.trim(), brand: null, barcode: null,
        kcal_100g: calc.kcal_100g, protein_100g: calc.protein_100g, carbs_100g: calc.carbs_100g, fat_100g: calc.fat_100g,
        serving_g: Math.round(calc.serving_g * 10) / 10, serving_label: '1 serving',
      };
      const { error: fe } = await supabase.from('foods').upsert(foodRow, { onConflict: 'id' });
      if (fe) throw fe;
      const rid = recipeId ?? newId();
      const { error: re } = await supabase.from('recipes').upsert(
        { id: rid, user_id: userId, food_id: foodRow.id, name: name.trim(), servings: sv, cooked_weight_g: cookedG ?? null }, { onConflict: 'id' });
      if (re) throw re;
      const { error: de } = await supabase.from('recipe_items').delete().eq('recipe_id', rid);
      if (de) throw de;
      const { error: ie } = await supabase.from('recipe_items').insert(saved.map((s) => ({ recipe_id: rid, user_id: userId, food_id: s.id, grams: s.grams })));
      if (ie) throw ie;
      await qc.invalidateQueries({ queryKey: ['my-foods'] });
      router.push('/foods');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!recipeFoodId) return;
    setBusy(true);
    const { error } = await supabase.from('foods').delete().eq('id', recipeFoodId); // cascades to recipe + items
    setBusy(false);
    if (error) return setErr(error.message);
    await qc.invalidateQueries({ queryKey: ['my-foods'] });
    router.push('/foods');
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <Link href="/foods" className="btn">Back</Link>
        <h1 className="text-lg font-semibold">{recipeFoodId ? 'Edit recipe' : 'New recipe'}</h1>
        <span className="w-16" />
      </header>

      <div>
        <label className="label" htmlFor="rname">Recipe name</label>
        <input id="rname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="rserv">Servings</label>
          <input id="rserv" className="input" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="rcook">Cooked weight (g, optional)</label>
          <input id="rcook" className="input" inputMode="decimal" value={cooked} onChange={(e) => setCooked(e.target.value)} />
        </div>
      </div>
      <p className="muted text-xs">Weigh the finished dish and enter it for the most accurate servings. If you leave it empty, the raw ingredient weight is used.</p>

      <section className="card">
        <h2 className="mb-1 text-sm font-semibold">Ingredients</h2>
        {items.length === 0 && <p className="muted text-sm">None yet.</p>}
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {items.map((i, idx) => (
            <li key={idx} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate">{i.food.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="muted text-sm">{i.grams} g</span>
                <button className="btn btn-danger" aria-label={`Remove ${i.food.name}`} onClick={() => setItems(items.filter((_, k) => k !== idx))}>×</button>
              </span>
            </li>
          ))}
        </ul>
        <button className="btn mt-2 w-full" onClick={() => setPicking(true)}>Add ingredient</button>
      </section>

      {perServing && (
        <div className="card text-center">
          <div className="muted text-xs">Per serving ({Math.round(calc!.serving_g)} g)</div>
          <div className="text-2xl font-bold">{Math.round(perServing.kcal)} kcal</div>
          <div className="muted text-sm">P {Math.round(perServing.protein_g)} · C {Math.round(perServing.carbs_g)} · F {Math.round(perServing.fat_g)}</div>
        </div>
      )}

      {err && <p className="err">{err}</p>}
      <button className="btn btn-primary w-full" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save recipe'}</button>
      {recipeFoodId && <button className="btn btn-danger w-full" disabled={busy} onClick={remove}>Delete recipe</button>}

      <Sheet open={picking && !selected} onClose={() => setPicking(false)} title="Add ingredient">
        <FoodSearch autoFocus onSelect={(f) => setSelected(f)} />
      </Sheet>
      <ServingSheet food={selected} cta="Add to recipe" onClose={() => setSelected(null)}
        onConfirm={(g) => { if (selected) setItems([...items, { food: selected, grams: g }]); setSelected(null); setPicking(false); }} />
    </div>
  );
}
