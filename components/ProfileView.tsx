'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { clearProfileCache, useProfile } from '@/lib/profile';
import OnboardingForm from './OnboardingForm';

export default function ProfileView() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  async function signOut() {
    clearProfileCache();
    try { localStorage.removeItem('macrocoach.pending-entries.v1'); } catch { /* ignore */ }
    await supabase.auth.signOut();
    qc.clear();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Profile and targets</h1>
      {saved && <p className="card text-sm" role="status">Saved. Your new targets are active.</p>}
      {profile && <OnboardingForm initial={profile} submitLabel="Update targets" onSaved={() => { setSaved(true); window.scrollTo({ top: 0 }); }} />}
      <button className="btn w-full" onClick={signOut}>Sign out</button>
    </div>
  );
}
