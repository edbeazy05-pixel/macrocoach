'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { authFetch } from '@/lib/api';
import { MEALS, isMealKey, mealLabel, type MealKey } from '@/lib/constants';
import { dayLabel, isDateString, todayLocal } from '@/lib/dates';
import { FOOD_COLUMNS, logFood, normalizeFood } from '@/lib/foods';
import { cleanCode } from '@/lib/barcode';
import type { FoodLike } from '@/lib/types';
import FoodSearch from './FoodSearch';
import ServingSheet from './ServingSheet';

export default function AddFood() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();

  const mealParam = params.get('meal');
  const dateParam = params.get('date');
  const [meal, setMeal] = useState<MealKey>(isMealKey(mealParam) ? mealParam : 'snacks');
  const date = isDateString(dateParam) ? dateParam : todayLocal();
  const barcode = params.get('barcode');

  const [selected, setSelected] = useState<FoodLike | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [scan, setScan] = useState<{ state: 'loading' | 'missing' | 'error'; code: string; message?: string } | null>(null);
  const handled = useRef<string | null>(null);

  // Arrived from the scanner with a barcode: look in your own foods first, then USDA and Open Food Facts
  useEffect(() => {
    if (!barcode || handled.current === barcode) return;
    handled.current = barcode;
    const code = cleanCode(barcode);
    setScan({ state: 'loading', code });
    (async () => {
      try {
        const stripped = code.replace(/^0+/, '');
        const { data } = await supabase.from('foods').select(FOOD_COLUMNS)
          .in('barcode', [code, stripped, `0${stripped}`]).limit(1).maybeSingle();
        if (data) { setSelected(normalizeFood(data)); setScan(null); return; }
        const res = await authFetch<{ food: FoodLike | null }>(`/api/food-barcode?code=${code}`);
        if (res.food) { setSelected(res.food); setScan(null); }
        else setScan({ state: 'missing', code });
      } catch (e) {
        setScan({ state: 'error', code, message: (e as Error).message });
      }
    })();
  }, [barcode]);

  async function confirm(grams: number) {
    if (!selected) return;
    setBusy(true); setErr(null);
    try {
      const r = await logFood(selected, grams, meal, date);
      await qc.invalidateQueries({ queryKey: ['entries'] });
      await qc.invalidateQueries({ queryKey: ['food-usage'] });
      setAdded(r.queued ? `${selected.name} saved on this phone; it will sync when you are online.` : `Added ${selected.name} to ${mealLabel(meal).toLowerCase()}.`);
      setSelected(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const back = date === todayLocal() ? '/' : `/?date=${date}`;
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <Link href={back} className="btn">Done</Link>
        <h1 className="truncate text-lg font-semibold">Add to {dayLabel(date).toLowerCase()}</h1>
        <Link href={`/scan?meal=${meal}&date=${date}`} className="btn">Scan</Link>
      </header>

      <div>
        <label className="label" htmlFor="meal">Meal</label>
        <select id="meal" className="input" value={meal} onChange={(e) => setMeal(e.target.value as MealKey)}>
          {MEALS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>

      {added && <p className="card text-sm" role="status" style={{ borderColor: 'var(--ok)' }}>{added}</p>}

      {scan?.state === 'loading' && <p className="muted text-sm">Looking up {scan.code}...</p>}
      {scan?.state === 'missing' && (
        <div className="card space-y-2">
          <p>Barcode {scan.code} was not found.</p>
          <Link className="btn btn-primary" href={`/foods?new=1&barcode=${scan.code}`}>Add it as a custom food</Link>
        </div>
      )}
      {scan?.state === 'error' && <p className="err">{scan.message}</p>}

      <FoodSearch onSelect={(f) => { setSelected(f); setErr(null); }} />

      <ServingSheet food={selected} cta={`Add to ${mealLabel(meal).toLowerCase()}`} busy={busy} error={err}
        onClose={() => setSelected(null)} onConfirm={confirm} />
      <button className="sr-only" onClick={() => router.push(back)}>Back</button>
    </div>
  );
}
