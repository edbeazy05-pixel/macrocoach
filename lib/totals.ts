export type EntryLike = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export const sumEntries = (rows: EntryLike[]) =>
  rows.reduce(
    (t, r) => ({
      kcal: t.kcal + Number(r.kcal),
      protein: t.protein + Number(r.protein_g),
      carbs: t.carbs + Number(r.carbs_g),
      fat: t.fat + Number(r.fat_g),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
