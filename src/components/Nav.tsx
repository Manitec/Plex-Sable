'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/',         label: 'presence' },
  { href: '/mind',     label: 'mind' },
  { href: '/speak',    label: 'speak' },
  { href: '/see',      label: 'see' },
  { href: '/one',      label: 'one' },
  { href: '/tell',     label: 'tell' },
];

export default function Nav() {
  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: 'clamp(1.25rem,3vw,2rem) clamp(1.5rem,5vw,3.5rem)',
      borderBottom: '1px solid var(--border)',
      position: 'relative', zIndex: 10,
    }}>
      <Link href="/" style={{ fontFamily: 'var(--font-garamond)', fontSize: '1.1rem', color: 'var(--accent)', opacity: 0.8, textDecoration: 'none', fontStyle: 'italic' }}>
        ◐ Plex
      </Link>
      <ul style={{ display: 'flex', gap: '2rem', listStyle: 'none', margin: 0, padding: 0 }}>
        {links.map(l => (
          <li key={l.href}>
            <Link href={l.href} style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase',
              letterSpacing: '0.1em', color: 'var(--muted)', textDecoration: 'none',
            }}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
