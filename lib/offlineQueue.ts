// Diary entries that could not be saved (no signal) wait here and are sent when the connection returns.
// Every queued entry has an id made on the phone, so a retry can never create a duplicate.
import { supabase } from './supabase';
import type { Entry } from './types';

const KEY = 'macrocoach.pending-entries.v1';
const EVENT = 'macrocoach-queue';

export type QueuedEntry = Omit<Entry, 'pending' | 'created_at'> & { user_id: string };

function read(): QueuedEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedEntry[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable: the entry stays only in memory for this visit */
  }
  window.dispatchEvent(new Event(EVENT));
}

export const getQueue = (userId?: string) => read().filter((q) => !userId || q.user_id === userId);

export function subscribeQueue(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', fn);
  };
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

// Saves an entry; if the network fails, queues it. Returns whether it was queued.
export async function saveEntry(entry: QueuedEntry): Promise<{ queued: boolean }> {
  try {
    const { error } = await supabase.from('food_entries').upsert(entry, { onConflict: 'id' });
    if (error) throw error;
    return { queued: false };
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    const msg = String((e as { message?: string })?.message ?? e);
    if (offline || /failed to fetch|network|load failed/i.test(msg)) {
      write([...read().filter((q) => q.id !== entry.id), entry]);
      return { queued: true };
    }
    throw e;
  }
}

let flushing = false;
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  const items = read();
  if (!items.length) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of items) {
      const { error } = await supabase.from('food_entries').upsert(item, { onConflict: 'id' });
      if (error) break; // stop at the first failure; try again later
      write(read().filter((q) => q.id !== item.id));
      sent += 1;
    }
  } finally {
    flushing = false;
  }
  return sent;
}
