import { KCAL_PER_KG, type Goal } from './tdee';

export type CheckInInput = {
  goal: Goal; weeklyRatePct: number; weightKg: number; changeKgPerWeek: number | null;
  targetKcal: number; avgKcal: number | null; daysLogged: number; floorKcal: number;
};
export type CheckInResult = { action: 'need_data' | 'keep' | 'adjust'; newKcal: number; deltaKcal: number; reason: string };

export function suggestAdjustment(i: CheckInInput): CheckInResult {
  const keep = (reason: string, action: 'need_data' | 'keep' = 'keep'): CheckInResult =>
    ({ action, newKcal: i.targetKcal, deltaKcal: 0, reason });
  if (i.changeKgPerWeek == null || i.daysLogged < 10)
    return keep('Not enough data yet: log at least 10 of the last 14 days and weigh in on 4 or more of them.', 'need_data');

  const expected = i.goal === 'maintain' ? 0 : ((i.goal === 'cut' ? -1 : 1) * i.weeklyRatePct * i.weightKg) / 100;
  const gap = i.changeKgPerWeek - expected;            // kg per week, positive = heavier than planned
  const tolerance = Math.max(0.1, 0.0015 * i.weightKg); // about 0.13 kg per week at 85 kg
  if (Math.abs(gap) <= tolerance) return keep('On track: your trend matches your goal rate.');

  // Eating well above target explains a stall better than a metabolism change does
  if (i.avgKcal != null && i.avgKcal > i.targetKcal * 1.1 && gap * (i.goal === 'bulk' ? -1 : 1) > 0)
    return keep(`You averaged ${Math.round(i.avgKcal)} kcal against a ${i.targetKcal} target. Hit the target for another week before changing it.`);

  const raw = (-gap * KCAL_PER_KG) / 7;                // kcal per day that closes the gap
  const capped = Math.max(-200, Math.min(200, raw));
  const delta = Math.round(capped / 25) * 25;
  const newKcal = Math.max(i.floorKcal, i.targetKcal + delta);
  if (newKcal === i.targetKcal) return keep('At your calorie floor: raise activity or accept a slower rate instead of eating less.');
  const dir = gap > 0 ? 'above' : 'below';
  return { action: 'adjust', newKcal, deltaKcal: newKcal - i.targetKcal,
    reason: `Your trend is ${Math.abs(gap).toFixed(2)} kg/week ${dir} plan.` };
}
