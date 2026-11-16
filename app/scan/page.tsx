import { Suspense } from 'react';
import ScanView from '@/components/ScanView';

export default function ScanPage() {
  return (
    <Suspense fallback={null}>
      <ScanView />
    </Suspense>
  );
}
