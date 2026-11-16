// Always the device's local date. Never use toISOString(), which is UTC and flips the day in the evening.
export const toLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayLocal = () => toLocalDate(new Date());

export const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split('-').map(Number);
  return toLocalDate(new Date(y, m - 1, d + n));
};

export const dayLabel = (s: string, today = todayLocal()) => {
  if (s === today) return 'Today';
  if (s === addDays(today, -1)) return 'Yesterday';
  if (s === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

export const isDateString = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
