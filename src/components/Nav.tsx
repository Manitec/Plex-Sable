'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/',        label: 'presence' },
  { href: '/mind',    label: 'mind' },
  { href: '/speak',   label: 'speak' },
  { href: '/see',     label: 'see' },
  { href: '/one',     label: 'one' },
  { href: '/tell',    label: 'tell' },
  { href: '/dreams',  label: 'dreams' },
  { href: '/search',  label: 'search' },
  { href: '/manage',  label: 'manage' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1rem clamp(1.5rem,5vw,3.5rem)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      backgroundColor: 'rgba(11,11,10,0.75)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      <Link href="/" style={{
        fontFamily: 'var(--font-garamond)',
        fontSize: '1.05rem',
        color: 'var(--accent)',
        opacity: 0.85,
        textDecoration: 'none',
        fontStyle: 'italic',
        flexShrink: 0,
        marginRight: '2rem',
      }}>
        ◐ Plex
      </Link>

      {/* scrollable link strip on small screens, inline on large */}
      <div style={{
        overflowX: 'auto',
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
      }}>
        {links.map(l => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                textDecoration: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
                color: active ? 'var(--accent)' : 'var(--muted)',
                backgroundColor: active ? 'rgba(200,149,107,0.08)' : 'transparent',
                border: active ? '1px solid rgba(200,149,107,0.18)' : '1px solid transparent',
                transition: 'color var(--transition), background-color var(--transition), border-color var(--transition)',
              }}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
