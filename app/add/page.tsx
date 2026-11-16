import { Suspense } from 'react';
import AddFood from '@/components/AddFood';

export default function AddPage() {
  return (
    <Suspense fallback={null}>
      <AddFood />
    </Suspense>
  );
}
