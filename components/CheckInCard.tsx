'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { currentUserId } from '@/lib/api';
import { addDays, todayLocal } from '@/lib/dates';
import { suggestAdjustment } from '@/lib/checkin';
import { defaultMacros } from '@/lib/tdee';
import { weeklyChangeKg } from '@/lib/trend';
import { fmtWeight } from '@/lib/units';
import { useProfile } from '@/lib/profile';
import type { WeighIn } from '@/lib/types';

export default function CheckInCard({ weighIns }: { weighIns: WeighIn[] }) {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const today = todayLocal();
  const from = addDays(today, -13);

  const intake = useQuery({
    queryKey: ['entries', 'checkin', from, today],
    queryFn: async () => {
      const { data, error } = await supabase.from('food_entries').select('entry_date, kcal').gte('entry_date', from).lte('entry_date', today);
      if (error) throw error;
      const byDay = new Map<string, number>();
      for (const r of data ?? []) byDay.set(r.entry_date, (byDay.get(r.entry_date) ?? 0) + Number(r.kcal));
      // A day with under 800 kcal logged is treated as "not really logged"
      const logged = [...byDay.values()].filter((k) => k >= 800);
      return { days: logged.length, avg: logged.length ? logged.reduce((s, k) => s + k, 0) / logged.length : null };
    },
  });

  if (!profile?.target_kcal || !profile.weight_kg || !profile.sex) return null;
  const latest = weighIns.length ? weighIns[weighIns.length - 1].weight_kg : profile.weight_kg;
  const change = weeklyChangeKg(weighIns.map((w) => ({ date: w.weigh_date, kg: w.weight_kg })), today, 14);
  const result = suggestAdjustment({
    goal: profile.goal, weeklyRatePct: profile.weekly_rate_pct, weightKg: latest, changeKgPerWeek: change,
    targetKcal: profile.target_kcal, avgKcal: intake.data?.avg ?? null, daysLogged: intake.data?.days ?? 0,
    floorKcal: profile.sex === 'male' ? 1500 : 1200,
  });

  async function apply() {
    if (!profile) return;
    setBusy(true); setErr(null);
    try {
      const userId = await currentUserId();
      const m = defaultMacros(result.newKcal, latest, profile.goal);
      const { error } = await supabase.from('nutrition_profiles').update({
        target_kcal: result.newKcal, target_protein_g: m.protein_g, target_carbs_g: m.carbs_g, target_fat_g: m.fat_g,
        updated_at: new Date().toISOString(),
      }).eq('id', userId);
      if (error) throw error;
      await supabase.from('weekly_checkins').insert({
        user_id: userId, checkin_date: today, old_kcal: profile.target_kcal, new_kcal: result.newKcal,
        trend_kg_per_week: change, avg_kcal: intake.data?.avg ?? null, reason: result.reason,
      });
      await qc.invalidateQueries({ queryKey: ['profile'] });
      setDone(`Target is now ${result.newKcal} kcal.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const perWeek = change == null ? null : `${change > 0 ? '+' : ''}${fmtWeight(Math.abs(change) * (change < 0 ? -1 : 1), profile.units, 2)}`;
  return (
    <section className="card space-y-2">
      <h2 className="font-semibold">Weekly check-in</h2>
      <p className="muted text-sm">
        Last 14 days: {intake.data?.days ?? 0} days logged
        {intake.data?.avg ? `, averaging ${Math.round(intake.data.avg)} kcal` : ''}
        {perWeek ? `, trend ${perWeek} per week` : ''}.
      </p>
      <p className="text-sm">{result.reason}</p>
      {result.action === 'adjust' && !done && (
        <div className="space-y-2">
          <p className="font-semibold">{profile.target_kcal} → {result.newKcal} kcal ({result.deltaKcal > 0 ? '+' : ''}{result.deltaKcal})</p>
          <button className="btn btn-primary w-full" disabled={busy} onClick={apply}>{busy ? 'Applying...' : 'Apply new target'}</button>
        </div>
      )}
      {done && <p role="status" className="text-sm">{done}</p>}
      {err && <p className="err">{err}</p>}
    </section>
  );
}
