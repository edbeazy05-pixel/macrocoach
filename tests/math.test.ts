import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcTargets, macrosFromPercents, macrosFromProteinFat, weeksToTarget, ageFromBirthDate, bmrMifflin, bmrKatch } from '../lib/tdee';
import { scale, fromServing, recipeNutrition } from '../lib/nutrition';
import { mapUsdaFood } from '../lib/usda';
import { validBarcode, sameCode, mapOffProduct } from '../lib/barcode';
import { movingAverage, weeklyChangeKg } from '../lib/trend';
import { suggestAdjustment } from '../lib/checkin';

const today = new Date(2026, 10, 15);
const near = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test('age and BMR formulas', () => {
  assert.equal(ageFromBirthDate('1996-11-16', today), 29);
  assert.equal(ageFromBirthDate('1996-11-15', today), 30);
  assert.equal(bmrMifflin(85, 180, 30, 'male'), 1830);
  near(bmrMifflin(60, 165, 28, 'female'), 1330.25);
  near(bmrKatch(85, 15), 370 + 21.6 * 72.25);
});

const base = { sex: 'male' as const, birthDate: '1996-01-01', heightCm: 180, weightKg: 85, bodyFatPct: null, formula: 'mifflin' as const, neat: 'moderate' as const, trainingDays: 4, goal: 'cut' as const, weeklyRatePct: 0.75 };

test('targets: the four reference rows in the roadmap', () => {
  const a = calcTargets(base, today);
  assert.deepEqual([a.bmr, a.tdee, a.adjustment, a.kcal, a.protein_g, a.carbs_g, a.fat_g], [1830, 2818, -701, 2120, 187, 190, 68]);
  const b = calcTargets({ ...base, formula: 'katch', bodyFatPct: 15 }, today);
  assert.deepEqual([b.bmr, b.tdee, b.kcal, b.protein_g, b.carbs_g, b.fat_g], [1931, 2973, 2270, 187, 228, 68]);
  const c = calcTargets({ ...base, goal: 'bulk', weeklyRatePct: 0.25 }, today);
  assert.deepEqual([c.kcal, c.protein_g, c.carbs_g, c.fat_g], [3050, 153, 418, 85]);
  const d = calcTargets({ ...base, sex: 'female', weightKg: 55, heightCm: 160, weeklyRatePct: 1.25, trainingDays: 0, neat: 'low' }, today);
  assert.deepEqual([d.bmr, d.tdee, d.kcal, d.protein_g, d.carbs_g, d.fat_g], [1239, 1487, 1200, 121, 80, 44]);
  assert.equal(d.warnings.length, 2);
});

test('katch without body fat falls back with a warning', () => {
  const r = calcTargets({ ...base, formula: 'katch' }, today);
  assert.equal(r.bmr, 1830);
  assert.ok(r.warnings[0].includes('Katch'));
});

test('macro splitter modes', () => {
  assert.deepEqual(macrosFromPercents(2000, 30, 40, 30), { protein_g: 150, carbs_g: 200, fat_g: 67 });
  assert.deepEqual(macrosFromProteinFat(2000, 160, 60), { protein_g: 160, fat_g: 60, carbs_g: 205 });
  assert.throws(() => macrosFromPercents(2000, 30, 40, 20));
  assert.equal(weeksToTarget(85, 78, 0.75), 11);
});

test('servings and recipes', () => {
  const chicken = { kcal_100g: 165, protein_100g: 31, carbs_100g: 0, fat_100g: 3.6 };
  const rice = { kcal_100g: 130, protein_100g: 2.7, carbs_100g: 28, fat_100g: 0.3 };
  const oil = { kcal_100g: 884, protein_100g: 0, carbs_100g: 0, fat_100g: 100 };
  assert.deepEqual(scale(chicken, 150), { kcal: 247.5, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 });
  assert.deepEqual(fromServing({ kcal: 200, protein: 5, carbs: 30, fat: 6 }, 40), { kcal_100g: 500, protein_100g: 12.5, carbs_100g: 75, fat_100g: 15 });
  const r = recipeNutrition([{ food: chicken, grams: 600 }, { food: rice, grams: 300 }, { food: oil, grams: 15 }], 4);
  near(r.total.kcal, 1512.6);
  assert.equal(scale(r, r.serving_g).kcal, 378.1);
  const r2 = recipeNutrition([{ food: chicken, grams: 600 }, { food: rice, grams: 300 }, { food: oil, grams: 15 }], 4, 700);
  assert.equal(r2.serving_g, 175);
  assert.equal(scale(r2, r2.serving_g).kcal, 378.1);
});

test('USDA mapping', () => {
  const y = mapUsdaFood({ fdcId: 123, description: 'GREEK YOGURT, PLAIN', brandOwner: 'ACME FOODS', gtinUpc: '012345678905', servingSize: 170, servingSizeUnit: 'g', householdServingFullText: '3/4 cup', foodNutrients: [{ nutrientId: 1008, value: 59 }, { nutrientId: 1003, value: 10.2 }, { nutrientId: 1005, value: 3.6 }, { nutrientId: 1004, value: 0.4 }] });
  assert.equal(y?.name, 'Greek Yogurt, Plain');
  assert.equal(y?.serving_g, 170);
  const z = mapUsdaFood({ fdcId: 5, description: 'Chicken, breast, raw', foodNutrients: [{ nutrientId: 2047, value: 120 }, { nutrientId: 1003, value: 22.5 }] });
  assert.equal(z?.kcal_100g, 120);
  assert.equal(mapUsdaFood({ fdcId: 6, description: 'x', foodNutrients: [] }), null);
});

test('barcodes', () => {
  assert.ok(validBarcode('3017620422003') && validBarcode('012345678905') && validBarcode('96385074'));
  assert.ok(!validBarcode('3017620422004') && !validBarcode('123'));
  assert.ok(sameCode('012345678905', '0012345678905') && !sameCode('123', '124'));
  const f = mapOffProduct('3017620422003', { product_name: 'Nutella', brands: 'Ferrero,Other', serving_quantity: 15, serving_size: '15 g', nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } });
  assert.equal(f?.brand, 'Ferrero');
  assert.equal(mapOffProduct('1', { product_name: 'KJ only', nutriments: { energy_100g: 418.4 } })?.kcal_100g, 100);
  assert.equal(mapOffProduct('1', { product_name: 'none', nutriments: {} }), null);
});

test('trend and weekly change', () => {
  const w = [{ date: '2026-11-01', kg: 85 }, { date: '2026-11-03', kg: 84.8 }, { date: '2026-11-08', kg: 84.5 }, { date: '2026-11-12', kg: 84.1 }, { date: '2026-11-15', kg: 84.0 }];
  assert.deepEqual(movingAverage(w).map((x) => Number(x.trend.toFixed(2))), [85, 84.9, 84.65, 84.3, 84.05]);
  near(weeklyChangeKg(w, '2026-11-15') as number, -0.4926, 0.001);
  assert.equal(weeklyChangeKg(w.slice(0, 3), '2026-11-15'), null);
});

test('weekly check-in decisions', () => {
  const b = { goal: 'cut' as const, weeklyRatePct: 0.75, weightKg: 85, targetKcal: 2120, avgKcal: 2100, daysLogged: 13, floorKcal: 1500 };
  assert.deepEqual(suggestAdjustment({ ...b, changeKgPerWeek: -0.2 }).newKcal, 1920);
  assert.equal(suggestAdjustment({ ...b, changeKgPerWeek: -0.6 }).action, 'keep');
  assert.equal(suggestAdjustment({ ...b, changeKgPerWeek: -1.3 }).newKcal, 2320);
  assert.equal(suggestAdjustment({ ...b, changeKgPerWeek: -0.2, avgKcal: 2500 }).action, 'keep');
  assert.equal(suggestAdjustment({ ...b, changeKgPerWeek: -0.3, daysLogged: 6 }).action, 'need_data');
  assert.ok(suggestAdjustment({ ...b, changeKgPerWeek: 0, targetKcal: 1500, avgKcal: 1500 }).reason.includes('floor'));
  assert.equal(suggestAdjustment({ ...b, goal: 'bulk', weeklyRatePct: 0.25, changeKgPerWeek: 0, targetKcal: 3000, avgKcal: 3000 }).newKcal, 3200);
});
