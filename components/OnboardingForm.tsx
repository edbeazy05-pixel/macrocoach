'use client';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { currentUserId } from '@/lib/api';
import { todayLocal } from '@/lib/dates';
import {
  calcTargets, macrosFromPercents, macrosFromProteinFat, weeksToTarget,
  type Goal, type NeatLevel,
} from '@/lib/tdee';
import { cmFromFtIn, ftInFromCm, fromDisplayWeight, toDisplayWeight } from '@/lib/units';
import type { Profile, Units } from '@/lib/types';

const r1 = (x: number) => String(Math.round(x * 10) / 10);

export default function OnboardingForm({ initial, onSaved, submitLabel = 'Save and start' }: {
  initial?: Profile | null; onSaved: () => void; submitLabel?: string;
}) {
  const qc = useQueryClient();
  const u0: Units = initial?.units ?? 'lb';
  const ftIn0 = initial?.height_cm ? ftInFromCm(initial.height_cm) : null;

  const [units, setUnits] = useState<Units>(u0);
  const [sex, setSex] = useState<'male' | 'female'>(initial?.sex ?? 'male');
  const [birth, setBirth] = useState(initial?.birth_date ?? '');
  const [ft, setFt] = useState(ftIn0 ? String(ftIn0.ft) : '');
  const [inch, setInch] = useState(ftIn0 ? String(Math.round(ftIn0.inch * 10) / 10) : '');
  const [cm, setCm] = useState(initial?.height_cm ? r1(initial.height_cm) : '');
  const [weight, setWeight] = useState(initial?.weight_kg ? r1(toDisplayWeight(initial.weight_kg, u0)) : '');
  const [target, setTarget] = useState(initial?.target_weight_kg ? r1(toDisplayWeight(initial.target_weight_kg, u0)) : '');
  const [bf, setBf] = useState(initial?.body_fat_pct != null ? String(initial.body_fat_pct) : '');
  const [formula, setFormula] = useState<'mifflin' | 'katch'>(initial?.formula ?? 'mifflin');
  const [neat, setNeat] = useState<NeatLevel>(initial?.neat_level ?? 'moderate');
  const [days, setDays] = useState(String(initial?.training_days ?? 3));
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? 'cut');
  const [rate, setRate] = useState(String(initial?.weekly_rate_pct ?? 0.5));
  const [macroMode, setMacroMode] = useState<'auto' | 'percent' | 'grams'>('auto');
  const [pp, setPp] = useState('30'); const [cp, setCp] = useState('40'); const [fp, setFp] = useState('30');
  const [pg, setPg] = useState(''); const [fg, setFg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const heightCm = units === 'lb' ? (ft || inch ? cmFromFtIn(Number(ft) || 0, Number(inch) || 0) : NaN) : Number(cm);
  const weightKg = fromDisplayWeight(Number(weight), units);
  const targetKg = target ? fromDisplayWeight(Number(target), units) : null;
  const bfNum = bf === '' ? null : Number(bf);

  const calc = useMemo(() => {
    if (!birth || !(heightCm > 0) || !(weightKg > 0)) return null;
    try {
      return calcTargets({
        sex, birthDate: birth, heightCm, weightKg, bodyFatPct: bfNum, formula, neat,
        trainingDays: Number(days) || 0, goal, weeklyRatePct: goal === 'maintain' ? 0 : Number(rate) || 0,
      });
    } catch { return null; }
  }, [sex, birth, heightCm, weightKg, bfNum, formula, neat, days, goal, rate]);

  const final = useMemo(() => {
    if (!calc) return null;
    try {
      if (macroMode === 'percent') return { ...macrosFromPercents(calc.kcal, Number(pp), Number(cp), Number(fp)), error: null as string | null };
      if (macroMode === 'grams') return { ...macrosFromProteinFat(calc.kcal, Number(pg) || 0, Number(fg) || 0), error: null };
    } catch (e) {
      return { protein_g: calc.protein_g, carbs_g: calc.carbs_g, fat_g: calc.fat_g, error: (e as Error).message };
    }
    return { protein_g: calc.protein_g, carbs_g: calc.carbs_g, fat_g: calc.fat_g, error: null };
  }, [calc, macroMode, pp, cp, fp, pg, fg]);

  const weeks = targetKg && weightKg && goal !== 'maintain' ? weeksToTarget(weightKg, targetKg, Number(rate)) : null;

  async function save() {
    setErr(null);
    if (!calc || !final) return setErr('Fill in birth date, height and weight first.');
    if (final.error) return setErr(final.error);
    if (formula === 'katch' && bfNum == null) return setErr('Katch-McArdle needs a body fat %.');
    setBusy(true);
    try {
      const id = await currentUserId();
      const row = {
        id, sex, birth_date: birth, height_cm: Math.round(heightCm * 10) / 10, weight_kg: Math.round(weightKg * 100) / 100,
        target_weight_kg: targetKg ? Math.round(targetKg * 100) / 100 : null, body_fat_pct: bfNum,
        neat_level: neat, training_days: Number(days) || 0, formula, goal,
        weekly_rate_pct: goal === 'maintain' ? 0 : Number(rate) || 0,
        target_kcal: calc.kcal, target_protein_g: final.protein_g, target_carbs_g: final.carbs_g, target_fat_g: final.fat_g,
        units, updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('nutrition_profiles').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      if (!initial) {
        // First setup: record the starting weight so the trend has a first point
        await supabase.from('weigh_ins').upsert(
          { user_id: id, weigh_date: todayLocal(), weight_kg: row.weight_kg }, { onConflict: 'user_id,weigh_date' });
      }
      await qc.invalidateQueries({ queryKey: ['profile'] });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const num = (v: string, set: (s: string) => void, id: string, label: string, mode: 'decimal' | 'numeric' = 'decimal') => (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" inputMode={mode} value={v} onChange={(e) => set(e.target.value)} />
    </div>
  );
  const pick = <T extends string>(val: T, set: (v: T) => void, opts: [T, string][]) => (
    <div className="flex flex-wrap gap-2">
      {opts.map(([k, l]) => <button type="button" key={k} className="chip" aria-pressed={val === k} onClick={() => set(k)}>{l}</button>)}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="font-semibold">About you</h2>
        <div><span className="label">Units</span>{pick(units, setUnits, [['lb', 'lb / ft'], ['kg', 'kg / cm']])}</div>
        <div><span className="label">Sex (used by the formula)</span>{pick(sex, setSex, [['male', 'Male'], ['female', 'Female']])}</div>
        <div>
          <label className="label" htmlFor="birth">Birth date</label>
          <input id="birth" type="date" className="input" value={birth} onChange={(e) => setBirth(e.target.value)} />
        </div>
        {units === 'lb' ? (
          <div className="grid grid-cols-2 gap-2">{num(ft, setFt, 'ft', 'Height (ft)', 'numeric')}{num(inch, setInch, 'in', 'Inches')}</div>
        ) : num(cm, setCm, 'cm', 'Height (cm)')}
        <div className="grid grid-cols-2 gap-2">
          {num(weight, setWeight, 'wt', `Weight (${units})`)}
          {num(target, setTarget, 'tw', `Goal weight (${units})`)}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Activity</h2>
        <div>
          <span className="label">Daily movement outside workouts</span>
          {pick(neat, setNeat, [['low', 'Low (desk job)'], ['moderate', 'Moderate'], ['high', 'High (on your feet)']])}
        </div>
        {num(days, setDays, 'days', 'Training sessions per week', 'numeric')}
        <div>
          <span className="label">Calorie formula</span>
          {pick(formula, setFormula, [['mifflin', 'Mifflin-St Jeor'], ['katch', 'Katch-McArdle']])}
          {formula === 'katch' && <div className="mt-2">{num(bf, setBf, 'bf', 'Body fat %')}</div>}
          <p className="muted mt-1 text-xs">Katch-McArdle uses lean mass, so it needs a body fat % you trust. Mifflin-St Jeor needs only the basics.</p>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Goal</h2>
        {pick(goal, setGoal, [['cut', 'Lose fat'], ['maintain', 'Maintain'], ['bulk', 'Gain']])}
        {goal !== 'maintain' && (
          <div>
            {num(rate, setRate, 'rate', '% of body weight per week')}
            <p className="muted mt-1 text-xs">Common choices: 0.5% (steady) to 1% (fast) when cutting; 0.25% when gaining.</p>
          </div>
        )}
      </section>

      {calc && final && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Your targets</h2>
          <p className="text-3xl font-bold">{calc.kcal} <span className="muted text-base font-normal">kcal / day</span></p>
          <p className="muted text-sm">Burn about {calc.tdee} kcal/day (BMR {calc.bmr}). {goal === 'maintain' ? '' : `${calc.adjustment > 0 ? '+' : ''}${calc.adjustment} kcal/day for your rate.`}</p>
          <p className="text-sm">Protein {final.protein_g} g · Carbs {final.carbs_g} g · Fat {final.fat_g} g</p>
          {weeks != null && <p className="muted text-sm">About {weeks} weeks to your goal weight at this rate.</p>}
          {calc.warnings.map((w) => <p key={w} className="err">{w}</p>)}
          <div className="pt-2">
            <span className="label">Macro split</span>
            {pick(macroMode, setMacroMode, [['auto', 'Recommended'], ['percent', 'By percent'], ['grams', 'Protein and fat grams']])}
          </div>
          {macroMode === 'percent' && (
            <div className="grid grid-cols-3 gap-2">
              {num(pp, setPp, 'pp', 'Protein %', 'numeric')}{num(cp, setCp, 'cp', 'Carbs %', 'numeric')}{num(fp, setFp, 'fp', 'Fat %', 'numeric')}
            </div>
          )}
          {macroMode === 'grams' && (
            <div className="grid grid-cols-2 gap-2">{num(pg, setPg, 'pg', 'Protein (g)')}{num(fg, setFg, 'fg', 'Fat (g)')}</div>
          )}
          {final.error && <p className="err">{final.error}</p>}
          <p className="muted text-xs">These are estimates. The weekly check-in adjusts them from your real weight trend.</p>
        </section>
      )}

      {err && <p className="err">{err}</p>}
      <button className="btn btn-primary w-full" disabled={busy || !calc} onClick={save}>{busy ? 'Saving...' : submitLabel}</button>
    </div>
  );
}
