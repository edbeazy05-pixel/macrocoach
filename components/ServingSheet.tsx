'use client';
import { useState } from 'react';
import Sheet from './Sheet';
import { scale } from '@/lib/nutrition';
import type { FoodLike } from '@/lib/types';

const CHIPS = [50, 100, 150, 200];

type Props = {
  food: FoodLike | null; cta: string; busy?: boolean; error?: string | null;
  onClose: () => void; onConfirm: (grams: number) => void;
};

// The inner sheet is keyed by food so the weight resets to that food's serving each time
export default function ServingSheet(props: Props) {
  const { food } = props;
  if (!food) return null;
  return <ServingBody key={`${food.id ?? food.source_id ?? food.name}`} {...props} food={food} />;
}

function ServingBody({ food, cta, busy, error, onClose, onConfirm }: Props & { food: FoodLike }) {
  const [grams, setGrams] = useState(String(food.serving_g ?? 100));
  const g = Number(grams);
  const valid = Number.isFinite(g) && g > 0 && g <= 5000;
  const n = valid ? scale(food, g) : null;
  const servings = food.serving_g && valid ? g / food.serving_g : null;
  const bump = (d: number) => food.serving_g && setGrams(String(Math.max(0.5, (servings ?? 1) + d) * food.serving_g));

  return (
    <Sheet open onClose={onClose} title={food.name}>
      <div className="space-y-3">
        {food.brand && <p className="muted text-sm">{food.brand}</p>}
        <div>
          <label className="label" htmlFor="grams">Weight (grams)</label>
          <input id="grams" className="input" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} autoFocus />
        </div>
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => <button key={c} className="chip" onClick={() => setGrams(String(c))}>{c} g</button>)}
          {food.serving_g && (
            <button className="chip" onClick={() => setGrams(String(food.serving_g))}>
              1 serving{food.serving_label ? ` (${food.serving_label})` : ''}
            </button>
          )}
        </div>
        {food.serving_g && (
          <div className="flex items-center gap-3">
            <button className="btn" onClick={() => bump(-0.5)} aria-label="Half a serving less">−</button>
            <span className="text-sm">{servings ? `${Math.round(servings * 100) / 100} servings` : ''}</span>
            <button className="btn" onClick={() => bump(0.5)} aria-label="Half a serving more">+</button>
          </div>
        )}
        <div className="card text-center">
          <div className="text-2xl font-bold">{n ? Math.round(n.kcal) : '–'} <span className="muted text-sm font-normal">kcal</span></div>
          <div className="muted text-sm">
            P {n ? Math.round(n.protein_g) : '–'} g · C {n ? Math.round(n.carbs_g) : '–'} g · F {n ? Math.round(n.fat_g) : '–'} g
          </div>
        </div>
        {food.source === 'off' && <p className="muted text-xs">Community data from Open Food Facts. Check it against the label.</p>}
        {error && <p className="err">{error}</p>}
        <button className="btn btn-primary w-full" disabled={!valid || busy} onClick={() => valid && onConfirm(g)}>
          {busy ? 'Saving...' : cta}
        </button>
      </div>
    </Sheet>
  );
}
