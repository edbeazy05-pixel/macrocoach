import { dayNum } from '@/lib/trend';

type P = { date: string; kg: number; trend: number };

// Simple SVG line chart: dots are daily weigh-ins, the line is the 7-day trend
export default function TrendChart({ points, convert, unit }: { points: P[]; convert: (kg: number) => number; unit: string }) {
  if (points.length < 2) return <p className="muted text-sm">Log a few weigh-ins to see your trend.</p>;
  const W = 340, H = 160, padL = 34, padR = 8, padT = 10, padB = 20;
  const xs = points.map((p) => dayNum(p.date));
  const ys = points.flatMap((p) => [convert(p.kg), convert(p.trend)]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 1) { y0 -= 0.5; y1 += 0.5; }
  const pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
  const sx = (d: number) => padL + ((d - x0) / Math.max(1, x1 - x0)) * (W - padL - padR);
  const sy = (v: number) => padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${sx(dayNum(p.date)).toFixed(1)},${sy(convert(p.trend)).toFixed(1)}`).join(' ');
  const ticks = [y0 + pad, (y0 + y1) / 2, y1 - pad];
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label={`Weight trend, latest ${convert(last.trend).toFixed(1)} ${unit}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} stroke="var(--border)" />
          <text x={padL - 4} y={sy(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{t.toFixed(0)}</text>
        </g>
      ))}
      {points.map((p) => <circle key={p.date} cx={sx(dayNum(p.date))} cy={sy(convert(p.kg))} r="2.5" fill="var(--muted)" opacity="0.6" />)}
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <text x={padL} y={H - 4} fontSize="10" fill="var(--muted)">{points[0].date.slice(5)}</text>
      <text x={W - padR} y={H - 4} fontSize="10" textAnchor="end" fill="var(--muted)">{last.date.slice(5)}</text>
    </svg>
  );
}
