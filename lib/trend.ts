export type Weigh = { date: string; kg: number };

export const dayNum = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

// 7-day trend: the average of every weigh-in in the 7 calendar days ending on each date
export function movingAverage(weighIns: Weigh[], window = 7) {
  const sorted = [...weighIns].sort((a, b) => dayNum(a.date) - dayNum(b.date));
  return sorted.map((w) => {
    const n = dayNum(w.date);
    const inWin = sorted.filter((x) => dayNum(x.date) <= n && dayNum(x.date) > n - window);
    return { date: w.date, kg: w.kg, trend: inWin.reduce((s, x) => s + x.kg, 0) / inWin.length };
  });
}

// Weekly change in kg: slope of a straight line through the last `days` days of weigh-ins
export function weeklyChangeKg(weighIns: Weigh[], endDate: string, days = 14) {
  const end = dayNum(endDate);
  const pts = weighIns.map((w) => ({ x: dayNum(w.date), y: w.kg })).filter((p) => p.x <= end && p.x > end - days);
  if (pts.length < 4) return null;
  const xs = pts.map((p) => p.x);
  if (Math.max(...xs) - Math.min(...xs) < 7) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  return (sxy / sxx) * 7;
}
