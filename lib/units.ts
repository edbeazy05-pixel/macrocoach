import type { Units } from './types';

export const KG_PER_LB = 0.45359237;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const cmFromFtIn = (ft: number, inch: number) => (ft * 12 + inch) * 2.54;
export const ftInFromCm = (cm: number) => {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return { ft, inch };
};

export const toDisplayWeight = (kg: number, units: Units) => (units === 'lb' ? kgToLb(kg) : kg);
export const fromDisplayWeight = (v: number, units: Units) => (units === 'lb' ? lbToKg(v) : v);
export const fmtWeight = (kg: number, units: Units, digits = 1) =>
  `${toDisplayWeight(kg, units).toFixed(digits)} ${units}`;
