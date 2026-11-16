'use client';
import { useRouter } from 'next/navigation';
import OnboardingForm from '@/components/OnboardingForm';
import { useProfile } from '@/lib/profile';

export default function OnboardingPage() {
  const router = useRouter();
  const { data: profile } = useProfile();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Set up your targets</h1>
      <OnboardingForm initial={profile} onSaved={() => router.replace('/')} />
    </div>
  );
}
