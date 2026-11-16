'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { authFetch } from '@/lib/api';
import { FOOD_COLUMNS, normalizeFood } from '@/lib/foods';
import type { FoodLike } from '@/lib/types';

export function FoodRow({ food, onClick }: { food: FoodLike; onClick: () => void }) {
  const tag = food.source === 'custom' ? 'My food' : food.source === 'recipe' ? 'Recipe' : null;
  return (
    <li>
      <button className="flex w-full items-center justify-between gap-3 py-2.5 text-left" onClick={onClick}>
        <span className="min-w-0">
          <span className="block truncate">{food.name}</span>
          <span className="muted block truncate text-xs">
            {[tag, food.brand, food.serving_label].filter(Boolean).join(' · ') || 'per 100 g'}
          </span>
        </span>
        <span className="muted shrink-0 text-xs">{Math.round(food.kcal_100g)} kcal / 100 g</span>
      </button>
    </li>
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function FoodSearch({ onSelect, autoFocus = false }: { onSelect: (f: FoodLike) => void; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 400);
  const [usdaType, setUsdaType] = useState<'whole' | 'branded'>('whole');
  const [list, setList] = useState<'recent' | 'frequent'>('recent');

  const mine = useQuery({
    queryKey: ['foods-search', q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const safe = q.replace(/[%,()]/g, ' ');
      const { data, error } = await supabase
        .from('foods').select(FOOD_COLUMNS)
        .or(`name.ilike.%${safe}%,brand.ilike.%${safe}%`).order('name').limit(20);
      if (error) throw error;
      return (data ?? []).map(normalizeFood);
    },
  });

  const usda = useQuery({
    queryKey: ['usda', q, usdaType],
    enabled: q.length >= 3,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    queryFn: async () => (await authFetch<{ foods: FoodLike[] }>(`/api/food-search?q=${encodeURIComponent(q)}&type=${usdaType === 'branded' ? 'branded' : 'whole'}`)).foods,
  });

  const recents = useQuery({
    queryKey: ['food-usage', list],
    enabled: text.trim().length === 0,
    queryFn: async () => {
      const { data: usage, error } = await supabase
        .from('food_usage').select('food_id, last_used, times_used')
        .order(list === 'recent' ? 'last_used' : 'times_used', { ascending: false }).limit(20);
      if (error) throw error;
      const ids = (usage ?? []).map((u) => u.food_id as string);
      if (!ids.length) return [];
      const { data: foods, error: e2 } = await supabase.from('foods').select(FOOD_COLUMNS).in('id', ids);
      if (e2) throw e2;
      return ids.map((id) => foods?.find((f) => f.id === id)).filter(Boolean).map((f) => normalizeFood(f as Record<string, unknown>));
    },
  });

  const typing = text.trim().length > 0;
  return (
    <div className="space-y-3">
      <input className="input" placeholder="Search foods (chicken breast, oats, Quest bar...)" value={text}
        onChange={(e) => setText(e.target.value)} autoFocus={autoFocus} aria-label="Search foods" />

      {!typing && (
        <section>
          <div className="mb-1 flex gap-2">
            <button className="chip" aria-pressed={list === 'recent'} onClick={() => setList('recent')}>Recent</button>
            <button className="chip" aria-pressed={list === 'frequent'} onClick={() => setList('frequent')}>Frequent</button>
          </div>
          {recents.isLoading && <p className="muted text-sm">Loading...</p>}
          {recents.data && recents.data.length === 0 && (
            <p className="muted text-sm">Foods you log will show up here, so repeat meals take one tap.</p>
          )}
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {recents.data?.map((f) => <FoodRow key={f.id} food={f} onClick={() => onSelect(f)} />)}
          </ul>
        </section>
      )}

      {typing && (
        <>
          {(mine.data?.length ?? 0) > 0 && (
            <section>
              <h3 className="muted mb-1 text-xs font-semibold uppercase">Your foods</h3>
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {mine.data!.map((f) => <FoodRow key={f.id} food={f} onClick={() => onSelect(f)} />)}
              </ul>
            </section>
          )}
          <section>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="muted text-xs font-semibold uppercase">USDA database</h3>
              <div className="flex gap-2">
                <button className="chip" aria-pressed={usdaType === 'whole'} onClick={() => setUsdaType('whole')}>Whole foods</button>
                <button className="chip" aria-pressed={usdaType === 'branded'} onClick={() => setUsdaType('branded')}>Packaged</button>
              </div>
            </div>
            {q.length < 3 && <p className="muted text-sm">Keep typing (3 letters or more).</p>}
            {usda.isFetching && <p className="muted text-sm">Searching...</p>}
            {usda.isError && <p className="err">{(usda.error as Error).message}</p>}
            {usda.data && usda.data.length === 0 && !usda.isFetching && <p className="muted text-sm">No matches. Try different words, or switch Whole foods and Packaged.</p>}
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {usda.data?.map((f) => <FoodRow key={f.source_id} food={f} onClick={() => onSelect(f)} />)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
