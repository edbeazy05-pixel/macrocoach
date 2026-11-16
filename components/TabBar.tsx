'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const icon = (d: string) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const TABS = [
  { href: '/', label: 'Today', d: 'M3 11l9-8 9 8M5 10v10h14V10' },
  { href: '/foods', label: 'Foods', d: 'M7 3v8a2 2 0 0 0 2 2v8M11 3v8M15 3c-2 2-2 6 0 8v10' },
  { href: '/progress', label: 'Progress', d: 'M3 20h18M6 16l4-5 3 3 5-7' },
  { href: '/profile', label: 'Profile', d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6' },
];

export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)]"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const active = path === t.href;
          return (
            <li key={t.href} className="flex-1">
              <Link href={t.href} aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center gap-0.5 py-2 text-xs"
                style={{ color: active ? 'var(--accent)' : 'var(--muted)', fontWeight: active ? 600 : 400 }}>
                {icon(t.d)}
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
