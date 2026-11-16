'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { currentUserId } from '@/lib/api';
import { FOOD_COLUMNS, normalizeFood } from '@/lib/foods';
import { fromServing } from '@/lib/nutrition';
import { cleanCode } from '@/lib/barcode';
import { newId } from '@/lib/offlineQueue';
import type { FoodLike } from '@/lib/types';
import Sheet from './Sheet';

type Form = { name: string; brand: string; servingG: string; kcal: string; protein: string; carbs: string; fat: string; barcode: string };
const EMPTY: Form = { name: '', brand: '', servingG: '100', kcal: '', protein: '', carbs: '', fat: '', barcode: '' };

export default function FoodsView() {
  const params = useSearchParams();
  const qc = useQueryClient();
  // Arriving from the scanner (?new=1&barcode=...) opens the new-food form with the barcode filled in
  const fromScan = params.get('new') === '1';
  const [open, setOpen] = useState(fromScan);
  const [form, setForm] = useState<Form>(fromScan ? { ...EMPTY, barcode: cleanCode(params.get('barcode') ?? '') } : EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const foods = useQuery({
    queryKey: ['my-foods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('foods').select(FOOD_COLUMNS)
        .in('source', ['custom', 'recipe']).order('name');
      if (error) throw error;
      return (data ?? []).map(normalizeFood);
    },
  });

  function edit(f: FoodLike) {
    if (f.source !== 'custom') return;
    const s = f.serving_g ?? 100;
    const r = (x: number) => String(Math.round(((x * s) / 100) * 10) / 10);
    setForm({ name: f.name, brand: f.brand ?? '', servingG: String(s), kcal: r(f.kcal_100g), protein: r(f.protein_100g),
      carbs: r(f.carbs_100g), fat: r(f.fat_100g), barcode: f.barcode ?? '' });
    setEditId(f.id ?? null);
    setErr(null);
    setOpen(true);
  }

  async function save() {
    setErr(null);
    const n = (s: string) => Number(s.replace(',', '.'));
    const serving = n(form.servingG);
    if (!form.name.trim()) return setErr('Give the food a name.');
    if (!(serving > 0)) return setErr('Serving size in grams must be above 0.');
    const vals = [form.kcal, form.protein, form.carbs, form.fat].map(n);
    if (vals.some((v) => !Number.isFinite(v) || v < 0)) return setErr('Fill in calories, protein, carbs and fat (0 is fine).');
    setBusy(true);
    try {
      const per = fromServing({ kcal: vals[0], protein: vals[1], carbs: vals[2], fat: vals[3] }, serving);
      const userId = await currentUserId();
      const row = {
        id: editId ?? newId(), user_id: userId, source: 'custom', source_id: editId ? undefined : newId(),
        name: form.name.trim(), brand: form.brand.trim() || null, barcode: cleanCode(form.barcode) || null,
        serving_g: serving, serving_label: `${serving} g`, ...per,
      };
      const { error } = await supabase.from('foods').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['my-foods'] });
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editId) return;
    setBusy(true);
    const { error } = await supabase.from('foods').delete().eq('id', editId);
    setBusy(false);
    if (error) return setErr(error.message);
    await qc.invalidateQueries({ queryKey: ['my-foods'] });
    setOpen(false);
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const field = (k: keyof Form, label: string, mode: 'text' | 'decimal' = 'decimal') => (
    <div>
      <label className="label" htmlFor={`f-${k}`}>{label}</label>
      <input id={`f-${k}`} className="input" inputMode={mode} value={form[k]} onChange={set(k)} />
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Foods</h1>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setEditId(null); setErr(null); setOpen(true); }}>New food</button>
        <Link href="/recipe" className="btn">New recipe</Link>
      </div>
      <Link href="/scan" className="btn w-full">Scan a barcode</Link>

      <section>
        <h2 className="muted mb-1 text-xs font-semibold uppercase">My foods and recipes</h2>
        {foods.isLoading && <p className="muted text-sm">Loading...</p>}
        {foods.isError && <p className="err">{(foods.error as Error).message}</p>}
        {foods.data?.length === 0 && <p className="muted text-sm">Nothing yet. Add a food from its label, or build a recipe from ingredients.</p>}
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {foods.data?.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate">{f.name}</span>
                <span className="muted block text-xs">{f.source === 'recipe' ? 'Recipe' : 'Custom'} · {Math.round(f.kcal_100g)} kcal / 100 g</span>
              </span>
              {f.source === 'custom'
                ? <button className="btn" onClick={() => edit(f)}>Edit</button>
                : <Link className="btn" href={`/recipe?id=${f.id}`}>Open</Link>}
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={open} onClose={() => setOpen(false)} title={editId ? 'Edit food' : 'New food'}>
        <div className="space-y-3">
          {field('name', 'Name', 'text')}
          {field('brand', 'Brand (optional)', 'text')}
          {field('servingG', 'Serving size (grams)')}
          <p className="muted text-xs">Enter the numbers for ONE serving, exactly as on the label.</p>
          <div className="grid grid-cols-2 gap-2">
            {field('kcal', 'Calories')}
            {field('protein', 'Protein (g)')}
            {field('carbs', 'Carbs (g)')}
            {field('fat', 'Fat (g)')}
          </div>
          {field('barcode', 'Barcode (optional)')}
          {err && <p className="err">{err}</p>}
          <button className="btn btn-primary w-full" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save'}</button>
          {editId && <button className="btn btn-danger w-full" disabled={busy} onClick={remove}>Delete food</button>}
        </div>
      </Sheet>
    </div>
  );
}
