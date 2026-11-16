'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/profile';
import { useUserId } from '@/lib/useUserId';
import { MEALS, type MealKey } from '@/lib/constants';
import { addDays, dayLabel, isDateString, todayLocal } from '@/lib/dates';
import { sumEntries } from '@/lib/totals';
import { copyDay, deleteEntry, logQuickAdd, restoreEntry, updateEntryGrams, updateQuickEntry } from '@/lib/foods';
import { getQueue, subscribeQueue, type QueuedEntry } from '@/lib/offlineQueue';
import type { Entry } from '@/lib/types';
import MacroRing from './MacroRing';
import Sheet from './Sheet';

const num = (s: string) => (s.trim() === '' ? 0 : Number(s));

export default function TodayView() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const userId = useUserId();
  const { data: profile } = useProfile();

  const today = todayLocal();
  const dateParam = params.get('date');
  const date = isDateString(dateParam) ? dateParam : today;
  const setDate = (d: string) => router.replace(d === today ? '/' : `/?date=${d}`);

  const entriesQuery = useQuery({
    queryKey: ['entries', date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_entries').select('*').eq('entry_date', date).order('created_at');
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r, kcal: Number(r.kcal), protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g), fat_g: Number(r.fat_g),
        grams: r.grams == null ? null : Number(r.grams),
      })) as Entry[];
    },
  });

  // Entries saved with no signal and not sent yet
  const [queued, setQueued] = useState<QueuedEntry[]>([]);
  useEffect(() => {
    if (!userId) return;
    const sync = () => setQueued(getQueue(userId));
    sync();
    return subscribeQueue(sync);
  }, [userId]);

  const entries = useMemo(() => {
    const server = entriesQuery.data ?? [];
    const ids = new Set(server.map((e) => e.id));
    const pending: Entry[] = queued
      .filter((q) => q.entry_date === date && !ids.has(q.id))
      .map(({ user_id: _u, ...rest }) => { void _u; return { ...rest, pending: true }; });
    return [...server, ...pending];
  }, [entriesQuery.data, queued, date]);

  const totals = sumEntries(entries);
  const target = {
    kcal: profile?.target_kcal ?? 0, protein: profile?.target_protein_g ?? 0,
    carbs: profile?.target_carbs_g ?? 0, fat: profile?.target_fat_g ?? 0,
  };
  const remaining = target.kcal - totals.kcal;

  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['entries'] }), [qc]);

  // ---- copy ----
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState(addDays(today, -1));
  async function doCopy(from: string, meal?: MealKey) {
    if (from === date) return setToast({ text: 'Pick a different day to copy from.' });
    if (entries.length > 0 && !confirm(`${dayLabel(date)} already has entries. Copy anyway?`)) return;
    try {
      const n = await copyDay(from, date, meal);
      await refresh();
      setToast({ text: n ? `Copied ${n} item${n > 1 ? 's' : ''} from ${dayLabel(from)}.` : `Nothing to copy from ${dayLabel(from)}.` });
      setCopyOpen(false);
    } catch (e) {
      setToast({ text: (e as Error).message });
    }
  }

  // ---- quick add ----
  const [quickOpen, setQuickOpen] = useState(false);
  const [qMeal, setQMeal] = useState<MealKey>('snacks');
  const [qName, setQName] = useState('');
  const [qKcal, setQKcal] = useState('');
  const [qP, setQP] = useState('');
  const [qC, setQC] = useState('');
  const [qF, setQF] = useState('');
  const [qErr, setQErr] = useState<string | null>(null);
  const qKcalNum = qKcal.trim() !== '' ? num(qKcal) : num(qP) * 4 + num(qC) * 4 + num(qF) * 9;

  async function submitQuick() {
    setQErr(null);
    if (!(qKcalNum > 0)) return setQErr('Enter calories, or at least one macro.');
    try {
      const r = await logQuickAdd({ meal: qMeal, date, name: qName.trim(), kcal: Math.round(qKcalNum), protein: num(qP), carbs: num(qC), fat: num(qF) });
      await refresh();
      setQuickOpen(false);
      setQName(''); setQKcal(''); setQP(''); setQC(''); setQF('');
      setToast({ text: r.queued ? 'Saved on this phone. It will sync when you are back online.' : 'Added.' });
    } catch (e) {
      setQErr((e as Error).message);
    }
  }

  // ---- edit / delete ----
  const [editing, setEditing] = useState<Entry | null>(null);
  const [eGrams, setEGrams] = useState('');
  const [eName, setEName] = useState('');
  const [eKcal, setEKcal] = useState('');
  const [eP, setEP] = useState('');
  const [eC, setEC] = useState('');
  const [eF, setEF] = useState('');
  const [eErr, setEErr] = useState<string | null>(null);

  function openEdit(e: Entry) {
    if (e.pending) return setToast({ text: 'Waiting to sync. You can edit it once it is saved.' });
    setEditing(e); setEErr(null);
    setEGrams(e.grams ? String(e.grams) : '');
    setEName(e.name); setEKcal(String(e.kcal)); setEP(String(e.protein_g)); setEC(String(e.carbs_g)); setEF(String(e.fat_g));
  }

  async function saveEdit() {
    if (!editing) return;
    setEErr(null);
    try {
      if (editing.grams) {
        const g = num(eGrams);
        if (!(g > 0)) return setEErr('Enter a weight in grams.');
        await updateEntryGrams(editing, g);
      } else {
        const k = num(eKcal);
        if (!(k >= 0)) return setEErr('Enter calories.');
        await updateQuickEntry(editing.id, { name: eName.trim() || 'Quick add', kcal: k, protein_g: num(eP), carbs_g: num(eC), fat_g: num(eF) });
      }
      await refresh();
      setEditing(null);
    } catch (e) {
      setEErr((e as Error).message);
    }
  }

  async function removeEntry() {
    if (!editing) return;
    const gone = editing;
    try {
      await deleteEntry(gone.id);
      await refresh();
      setEditing(null);
      setToast({
        text: `Deleted ${gone.name}.`,
        undo: async () => { await restoreEntry(gone); await refresh(); setToast(null); },
      });
    } catch (e) {
      setEErr((e as Error).message);
    }
  }

  if (!profile) return null;
  const over = remaining < 0;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <button className="btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
        <div className="text-center">
          <h1 className="text-lg font-semibold">{dayLabel(date)}</h1>
          {date !== today && <button className="text-sm" style={{ color: 'var(--accent)' }} onClick={() => setDate(today)}>Back to today</button>}
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setCopyOpen(true)} aria-label="Copy meals">Copy</button>
          <button className="btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
        </div>
      </header>

      <section className="card flex flex-col items-center gap-4" aria-label="Daily totals">
        <MacroRing value={totals.kcal} target={target.kcal} color={over ? 'var(--danger)' : 'var(--kcal)'} label="Calories" size={160}>
          <span className="text-3xl font-bold" style={{ color: over ? 'var(--danger)' : undefined }}>{Math.abs(Math.round(remaining))}</span>
          <span className="muted text-xs">{over ? 'kcal over' : 'kcal left'}</span>
          <span className="muted text-xs">{Math.round(totals.kcal)} / {target.kcal}</span>
        </MacroRing>
        <div className="flex w-full justify-around">
          {([
            ['Protein', totals.protein, target.protein, 'var(--protein)'],
            ['Carbs', totals.carbs, target.carbs, 'var(--carbs)'],
            ['Fat', totals.fat, target.fat, 'var(--fat)'],
          ] as const).map(([label, v, t, color]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <MacroRing value={v} target={t} color={color} label={label} size={72}>
                <span className="text-sm font-semibold">{Math.round(v)}</span>
              </MacroRing>
              <span className="text-xs">{label}</span>
              <span className="muted text-xs">of {t} g</span>
            </div>
          ))}
        </div>
      </section>

      {entriesQuery.isError && queued.length === 0 && (
        <p className="err">Could not load this day. Check your connection, then pull to refresh.</p>
      )}

      {MEALS.map((m) => {
        const list = entries.filter((e) => e.meal === m.key);
        const sub = sumEntries(list).kcal;
        const quiet = list.length === 0 && (m.key === 'pre_workout' || m.key === 'post_workout');
        return (
          <section key={m.key} className="card" aria-label={m.label}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{m.label}</h2>
              <div className="flex items-center gap-2">
                {!quiet && <span className="muted text-sm">{Math.round(sub)} kcal</span>}
                <Link href={`/add?meal=${m.key}&date=${date}`} className="btn btn-primary" style={{ padding: '6px 12px' }}>Add</Link>
              </div>
            </div>
            {!quiet && list.length === 0 && (
              <button className="mt-2 text-sm" style={{ color: 'var(--accent)' }} onClick={() => doCopy(addDays(date, -1), m.key)}>
                Copy this meal from yesterday
              </button>
            )}
            {list.length > 0 && (
              <ul className="mt-2 divide-y" style={{ borderColor: 'var(--border)' }}>
                {list.map((e) => (
                  <li key={e.id}>
                    <button className="flex w-full items-start justify-between gap-3 py-2 text-left" onClick={() => openEdit(e)}>
                      <span className="min-w-0">
                        <span className="block truncate">{e.name}</span>
                        <span className="muted block text-xs">
                          {e.grams ? `${Math.round(e.grams)} g · ` : ''}P {Math.round(e.protein_g)} · C {Math.round(e.carbs_g)} · F {Math.round(e.fat_g)}
                          {e.pending ? ' · waiting to sync' : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium">{Math.round(e.kcal)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <button className="btn btn-primary fixed bottom-20 right-4 z-30 shadow-lg" style={{ borderRadius: 999, padding: '12px 18px' }}
        onClick={() => setQuickOpen(true)} aria-label="Quick add calories">+ Quick add</button>

      {toast && (
        <div className="fixed inset-x-4 bottom-36 z-40 mx-auto flex max-w-md items-center justify-between rounded-xl px-4 py-3 text-sm shadow-lg"
          style={{ background: 'var(--fg)', color: 'var(--bg)' }} role="status">
          <span>{toast.text}</span>
          {toast.undo && <button className="font-semibold underline" onClick={toast.undo}>Undo</button>}
        </div>
      )}

      <Sheet open={quickOpen} onClose={() => setQuickOpen(false)} title="Quick add">
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="q-meal">Meal</label>
            <select id="q-meal" className="input" value={qMeal} onChange={(e) => setQMeal(e.target.value as MealKey)}>
              {MEALS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="q-name">Name (optional)</label>
            <input id="q-name" className="input" value={qName} onChange={(e) => setQName(e.target.value)} placeholder="Restaurant burrito" />
          </div>
          <div>
            <label className="label" htmlFor="q-kcal">Calories</label>
            <input id="q-kcal" className="input" inputMode="decimal" value={qKcal} onChange={(e) => setQKcal(e.target.value)}
              placeholder={qKcal === '' && qKcalNum > 0 ? `${Math.round(qKcalNum)} (from macros)` : 'kcal'} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([['Protein g', qP, setQP], ['Carbs g', qC, setQC], ['Fat g', qF, setQF]] as const).map(([l, v, set]) => (
              <div key={l}>
                <label className="label">{l}</label>
                <input className="input" inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} />
              </div>
            ))}
          </div>
          {qErr && <p className="err">{qErr}</p>}
          <button className="btn btn-primary w-full" onClick={submitQuick}>Add to {dayLabel(date).toLowerCase()}</button>
        </div>
      </Sheet>

      <Sheet open={copyOpen} onClose={() => setCopyOpen(false)} title={`Copy into ${dayLabel(date).toLowerCase()}`}>
        <div className="space-y-3">
          <button className="btn btn-primary w-full" onClick={() => doCopy(addDays(date, -1))}>Copy everything from the day before</button>
          <div className="divider pt-3">
            <label className="label" htmlFor="copy-from">Or copy a whole day from</label>
            <div className="flex gap-2">
              <input id="copy-from" type="date" className="input" value={copyFrom} max={todayLocal()} onChange={(e) => setCopyFrom(e.target.value)} />
              <button className="btn" onClick={() => isDateString(copyFrom) && doCopy(copyFrom)}>Copy</button>
            </div>
          </div>
        </div>
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.name ?? 'Entry'}>
        {editing && (
          <div className="space-y-3">
            {editing.grams ? (
              <>
                <div>
                  <label className="label" htmlFor="e-grams">Weight (grams)</label>
                  <input id="e-grams" className="input" inputMode="decimal" value={eGrams} onChange={(e) => setEGrams(e.target.value)} />
                </div>
                <p className="muted text-sm">
                  {Math.round(eGrams && num(eGrams) > 0 ? (editing.kcal * num(eGrams)) / editing.grams : editing.kcal)} kcal at this weight
                </p>
              </>
            ) : (
              <>
                <div>
                  <label className="label" htmlFor="e-name">Name</label>
                  <input id="e-name" className="input" value={eName} onChange={(e) => setEName(e.target.value)} />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {([['Calories', eKcal, setEKcal], ['Protein', eP, setEP], ['Carbs', eC, setEC], ['Fat', eF, setEF]] as const).map(([l, v, set]) => (
                    <div key={l}>
                      <label className="label">{l}</label>
                      <input className="input" inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} />
                    </div>
                  ))}
                </div>
              </>
            )}
            {eErr && <p className="err">{eErr}</p>}
            <div className="flex gap-2">
              <button className="btn btn-danger" onClick={removeEntry}>Delete</button>
              <button className="btn btn-primary flex-1" onClick={saveEdit}>Save</button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
