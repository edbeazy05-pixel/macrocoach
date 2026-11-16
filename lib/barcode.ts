import type { FoodLike } from './types';

// Keep digits only; UPC-A (12) is the same product as EAN-13 with a leading 0
export const cleanCode = (s: string) => s.replace(/\D/g, '');
export const sameCode = (a: string, b: string) =>
  cleanCode(a).replace(/^0+/, '') === cleanCode(b).replace(/^0+/, '');

// GS1 check digit: valid for EAN-8, UPC-A (12) and EAN-13
export function validBarcode(code: string) {
  const c = cleanCode(code);
  if (![8, 12, 13].includes(c.length)) return false;
  const digits = c.split('').map(Number);
  const check = digits.pop() as number;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

type OffProduct = {
  product_name?: string; brands?: string; serving_quantity?: number | string; serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
};

export function mapOffProduct(code: string, p: OffProduct | undefined): FoodLike | null {
  const n = p?.nutriments ?? {};
  const kcalRaw = n['energy-kcal_100g'];
  const kjRaw = n['energy_100g'];
  const kcal = typeof kcalRaw === 'number' ? kcalRaw : typeof kjRaw === 'number' ? kjRaw / 4.184 : null; // energy_100g is kJ
  if (!p?.product_name || kcal == null) return null;
  const sq = Number(p.serving_quantity);
  return {
    source: 'off', source_id: cleanCode(code), name: String(p.product_name),
    brand: p.brands ? String(p.brands).split(',')[0].trim() : null, barcode: cleanCode(code),
    kcal_100g: Math.round(kcal * 10) / 10, protein_100g: Number(n['proteins_100g'] ?? 0),
    carbs_100g: Number(n['carbohydrates_100g'] ?? 0), fat_100g: Number(n['fat_100g'] ?? 0),
    serving_g: sq > 0 ? sq : null, serving_label: p.serving_size ?? null,
  };
}
