import { redirect } from 'next/navigation';

// Older link shape from the roadmap (/add/meal). The real screen lives at /add.
export default function LegacyAddRedirect() {
  redirect('/add');
}
