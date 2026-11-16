import { Suspense } from 'react';
import TodayView from '@/components/TodayView';

export default function TodayPage() {
  return (
    <Suspense fallback={null}>
      <TodayView />
    </Suspense>
  );
}
