'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setNote(null);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) setNote('Check your email to confirm the account, then sign in. (You can turn email confirmation off in Supabase under Authentication, Providers, Email.)');
      }
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mx-auto max-w-sm space-y-4 pt-20" onSubmit={submit}>
      <h1 className="text-3xl font-bold">Macrocoach</h1>
      <p className="muted">{mode === 'in' ? 'Sign in to your tracker.' : 'Create your account.'}</p>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="pw">Password</label>
        <input id="pw" className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {err && <p className="err">{err}</p>}
      {note && <p className="muted text-sm">{note}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Please wait...' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
      <button type="button" className="btn btn-ghost w-full" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(null); setNote(null); }}>
        {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </form>
  );
}
