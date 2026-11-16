'use client';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { currentUserId } from '@/lib/api';
import { todayLocal } from '@/lib/dates';
import { movingAverage, weeklyChangeKg } from '@/lib/trend';
import { fmtWeight, fromDisplayWeight, toDisplayWeight } from '@/lib/units';
import { useProfile } from '@/lib/profile';
import type { WeighIn } from '@/lib/types';
import TrendChart from './TrendChart';
import CheckInCard from './CheckInCard';
import PhotoGallery from './PhotoGallery';

export default function ProgressView() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const units = profile?.units ?? 'lb';
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const weigh = useQuery({
    queryKey: ['weigh-ins'],
    queryFn: async (): Promise<WeighIn[]> => {
      const { data, error } = await supabase.from('weigh_ins').select('weigh_date, weight_kg').order('weigh_date');
      if (error) throw error;
      return (data ?? []).map((r) => ({ weigh_date: r.weigh_date, weight_kg: Number(r.weight_kg) }));
    },
  });

  const list = useMemo(() => weigh.data ?? [], [weigh.data]);
  const series = useMemo(() => movingAverage(list.map((w) => ({ date: w.weigh_date, kg: w.weight_kg }))), [list]);
  const shown = series.slice(-90);
  const latest = series[series.length - 1];
  const change = weeklyChangeKg(list.map((w) => ({ date: w.weigh_date, kg: w.weight_kg })), todayLocal(), 14);
  const conv = (kg: number) => toDisplayWeight(kg, units);

  async function add() {
    setErr(null);
    const v = Number(value.replace(',', '.'));
    if (!(v > 0)) return setErr('Enter your weight.');
    const kg = fromDisplayWeight(v, units);
    if (kg < 25 || kg > 400) return setErr('That weight looks wrong. Check the number and units.');
    setBusy(true);
    try {
      const userId = await currentUserId();
      const { error } = await supabase.from('weigh_ins').upsert(
        { user_id: userId, weigh_date: date, weight_kg: Math.round(kg * 100) / 100 }, { onConflict: 'user_id,weigh_date' });
      if (error) throw error;
      // Keep the profile weight current so calorie math uses it when targets are next recalculated
      if (date === todayLocal()) await supabase.from('nutrition_profiles').update({ weight_kg: Math.round(kg * 100) / 100 }).eq('id', userId);
      setValue('');
      await qc.invalidateQueries({ queryKey: ['weigh-ins'] });
      await qc.invalidateQueries({ queryKey: ['profile'] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeDay(d: string) {
    const { error } = await supabase.from('weigh_ins').delete().eq('weigh_date', d);
    if (error) return setErr(error.message);
    await qc.invalidateQueries({ queryKey: ['weigh-ins'] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Progress</h1>

      <section className="card space-y-3">
        <h2 className="font-semibold">Log weight</h2>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="w">Weight ({units})</label>
            <input id="w" className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="wd">Date</label>
            <input id="wd" type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy} onClick={add}>{busy ? 'Saving...' : 'Save weigh-in'}</button>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Trend</h2>
        {latest && (
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold">{fmtWeight(latest.trend, units)}</div>
              <div className="muted text-xs">7-day average (latest weigh-in {fmtWeight(latest.kg, units)})</div>
            </div>
            {change != null && (
              <div className="text-right text-sm">{change > 0 ? '+' : ''}{(conv(change)).toFixed(2)} {units}<div className="muted text-xs">per week</div></div>
            )}
          </div>
        )}
        <TrendChart points={shown} convert={conv} unit={units} />
        <p className="muted text-xs">Daily weight swings by 1 to 2 lb from water and food. The line smooths that out, so judge progress by the line.</p>
      </section>

      <CheckInCard weighIns={list} />

      {list.length > 0 && (
        <section className="card">
          <h2 className="mb-1 font-semibold">Recent weigh-ins</h2>
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {[...list].reverse().slice(0, 7).map((w) => (
              <li key={w.weigh_date} className="flex items-center justify-between py-2 text-sm">
                <span>{w.weigh_date}</span>
                <span className="flex items-center gap-3">{fmtWeight(w.weight_kg, units)}
                  <button className="btn btn-danger" aria-label={`Delete weigh-in ${w.weigh_date}`} onClick={() => removeDay(w.weigh_date)}>×</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PhotoGallery />
    </div>
  );
}
