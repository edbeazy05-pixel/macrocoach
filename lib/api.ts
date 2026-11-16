import { supabase } from './supabase';

// Calls one of our own /api routes with the signed-in user's token
export async function authFetch<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

export async function currentUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You are signed out. Sign in again.');
  return session.user.id;
}
