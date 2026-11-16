'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/profile';
import { flushQueue } from '@/lib/offlineQueue';
import TabBar from './TabBar';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true } },
});
const TAB_PATHS = ['/', '/foods', '/progress', '/profile'];

function Splash({ text }: { text?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="muted text-sm">{text ?? 'Macrocoach'}</p>
    </div>
  );
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { data: profile, isLoading, isError, isSuccess, refetch } = useProfile();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Only send a person to onboarding once we KNOW they have no targets (not while loading or offline)
    if (isSuccess && !profile?.target_kcal && path !== '/onboarding') router.replace('/onboarding');
  }, [isSuccess, profile, path, router]);

  if (isLoading) return <Splash />;
  if (isError && !profile) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 pt-24 text-center">
        <p>Could not reach the server.</p>
        <button className="btn btn-primary" onClick={() => refetch()}>Try again</button>
      </div>
    );
  }
  return <>{children}</>;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') queryClient.clear(); // never show one person's cache to the next
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session && path !== '/login') router.replace('/login');
    if (session && path === '/login') router.replace('/');
  }, [session, path, router]);

  const signedIn = !!session;
  useEffect(() => {
    if (!signedIn) return;
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const flush = () => {
      flushQueue().then((n) => {
        if (n > 0) queryClient.invalidateQueries({ queryKey: ['entries'] });
      });
    };
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [signedIn]);

  if (session === undefined) return <Splash />;
  if (!session) {
    return path === '/login' ? (
      <main className="mx-auto max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))]">{children}</main>
    ) : (
      <Splash />
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <OnboardingGate>
        <main className="mx-auto max-w-md px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">{children}</main>
        {TAB_PATHS.includes(path) && <TabBar />}
      </OnboardingGate>
    </QueryClientProvider>
  );
}
