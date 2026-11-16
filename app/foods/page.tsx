import { Suspense } from 'react';
import FoodsView from '@/components/FoodsView';

export default function FoodsPage() {
  return (
    <Suspense fallback={null}>
      <FoodsView />
    </Suspense>
  );
}
