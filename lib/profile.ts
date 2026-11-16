'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Profile } from './types';

const CACHE_KEY = 'macrocoach.profile.v1';

// The last good profile is kept on the phone so the app can open with no signal
function readCache(userId: string): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const p = raw ? (JSON.parse(raw) as Profile) : null;
    return p && p.id === userId ? p : null;
  } catch {
    return null;
  }
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data, error } = await supabase
        .from('nutrition_profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (error) {
        const cached = readCache(session.user.id);
        if (cached) return cached;
        throw error;
      }
      const profile = (data as Profile | null) ?? null;
      try {
        if (profile) localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
      } catch { /* storage unavailable */ }
      return profile;
    },
  });
}

export function clearProfileCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}
