import { Suspense } from 'react';
import RecipeBuilder from '@/components/RecipeBuilder';

export default function RecipePage() {
  return (
    <Suspense fallback={null}>
      <RecipeBuilder />
    </Suspense>
  );
}
