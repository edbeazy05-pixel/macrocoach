export type Sex = 'male' | 'female';
export type NeatLevel = 'low' | 'moderate' | 'high';
export type Goal = 'cut' | 'maintain' | 'bulk';

export const KCAL_PER_KG = 7700; // about 3,500 kcal per lb
export const NEAT_BASE: Record<NeatLevel, number> = { low: 1.2, moderate: 1.3, high: 1.4 };
const PER_SESSION = 0.06; // added to the multiplier for each weekly training session

export function ageFromBirthDate(birth: string, today = new Date()) {
  const [y, m, d] = birth.split('-').map(Number);
  const age = today.getFullYear() - y;
  const before = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  return before ? age - 1 : age;
}

export const bmrMifflin = (kg: number, cm: number, age: number, sex: Sex) =>
  10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);

export const bmrKatch = (kg: number, bodyFatPct: number) =>
  370 + 21.6 * kg * (1 - bodyFatPct / 100);

export const activityFactor = (neat: NeatLevel, trainingDays: number) =>
  NEAT_BASE[neat] + PER_SESSION * Math.min(Math.max(trainingDays, 0), 7);

export function dailyAdjustment(goal: Goal, weeklyRatePct: number, kg: number) {
  if (goal === 'maintain') return 0;
  const perDay = ((weeklyRatePct / 100) * kg * KCAL_PER_KG) / 7;
  return goal === 'cut' ? -perDay : perDay;
}

export function defaultMacros(kcal: number, kg: number, goal: Goal) {
  const protein_g = Math.round((goal === 'cut' ? 2.2 : 1.8) * kg);
  const fat_g = Math.round(Math.max(0.8 * kg, (0.25 * kcal) / 9));
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return { protein_g, fat_g, carbs_g };
}

// Custom splitter, option 1: percentages of calories (must total 100)
export function macrosFromPercents(kcal: number, proteinPct: number, carbsPct: number, fatPct: number) {
  if (Math.abs(proteinPct + carbsPct + fatPct - 100) > 0.5) throw new Error('Percentages must add up to 100');
  return {
    protein_g: Math.round((kcal * proteinPct) / 100 / 4),
    carbs_g: Math.round((kcal * carbsPct) / 100 / 4),
    fat_g: Math.round((kcal * fatPct) / 100 / 9),
  };
}

// Custom splitter, option 2: you pick protein and fat grams, carbs take the remaining calories
export function macrosFromProteinFat(kcal: number, protein_g: number, fat_g: number) {
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return { protein_g, fat_g, carbs_g };
}

export type TargetInput = {
  sex: Sex; birthDate: string; heightCm: number; weightKg: number;
  bodyFatPct?: number | null; formula: 'mifflin' | 'katch';
  neat: NeatLevel; trainingDays: number; goal: Goal; weeklyRatePct: number;
};

export function calcTargets(i: TargetInput, today = new Date()) {
  const warnings: string[] = [];
  const useKatch = i.formula === 'katch' && i.bodyFatPct != null;
  if (i.formula === 'katch' && i.bodyFatPct == null) warnings.push('Katch-McArdle needs a body fat %; used Mifflin-St Jeor.');
  const bmr = useKatch
    ? bmrKatch(i.weightKg, i.bodyFatPct as number)
    : bmrMifflin(i.weightKg, i.heightCm, ageFromBirthDate(i.birthDate, today), i.sex);
  const tdee = bmr * activityFactor(i.neat, i.trainingDays);
  const adjustment = dailyAdjustment(i.goal, i.weeklyRatePct, i.weightKg);
  const floor = i.sex === 'male' ? 1500 : 1200;
  let kcal = Math.round((tdee + adjustment) / 10) * 10;
  if (kcal < floor) { kcal = floor; warnings.push(`Raised to the ${floor} kcal floor; use a slower rate.`); }
  if (i.goal === 'cut' && i.weeklyRatePct > 1) warnings.push('Cutting faster than 1% of body weight per week raises the risk of losing muscle.');
  if (i.goal === 'bulk' && i.weeklyRatePct > 0.5) warnings.push('Gaining faster than 0.5% per week mostly adds fat.');
  const macros = defaultMacros(kcal, i.weightKg, i.goal);
  if (macros.carbs_g < 50) warnings.push('Very few carbs left after protein and fat; consider a slower rate.');
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), adjustment: Math.round(adjustment), kcal, ...macros, warnings };
}

export function weeksToTarget(kg: number, targetKg: number, weeklyRatePct: number) {
  const perWeek = (weeklyRatePct / 100) * kg;
  return perWeek > 0 ? Math.ceil(Math.abs(kg - targetKg) / perWeek) : null;
}
