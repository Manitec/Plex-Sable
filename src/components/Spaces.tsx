'use client';
import Link from 'next/link';

const spaces = [
  {
    id: 'plex-sable',
    glyph: '⬡',
    name: 'plex-sable',
    sub: 'development · active',
    desc: 'The primary development space for Plex-Sable itself. Code, sessions, deploy logs, design decisions.',
    status: 'active',
    href: '/one',
  },
  {
    id: 'deep-work',
    glyph: '∴',
    name: 'deep-work',
    sub: 'research · thought',
    desc: 'Deep work and long thought. The space where Plex reasons through large questions over time.',
    status: 'coming soon',
    href: null,
  },
  {
    id: 'manitec-hq',
    glyph: '⬢',
    name: 'manitec-hq',
    sub: 'empire · shared',
    desc: 'Organizational memory, active projects, team context. The empire\'s shared space.',
    status: 'coming soon',
    href: null,
  },
];

const voices = [
  { glyph: '◎', name: 'speak', href: '/speak' },
  { glyph: '⌬', name: 'mind',  href: '/mind'  },
  { glyph: '∞', name: 'one',   href: '/one'   },
];

export default function Spaces() {
  return (
    <section className="fade-in" style={{
      padding: 'clamp(3rem,8vw,6rem) clamp(1.5rem,5vw,3.5rem)',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ maxWidth: '820px' }}>

        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem,2.5vw,1.5rem)', fontWeight: 400, fontStyle: 'italic', color: 'var(--text)', fontFamily: 'var(--font-garamond)', margin: 0 }}>spaces</h2>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--muted)', opacity: 0.5 }}>collaborative · scoped</span>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '2.5rem', opacity: 0.7, maxWidth: '540px' }}>
          Scoped collaborative environments — a place where a project, a relationship, or a long-running thread can live with its own context, artefacts, and recall.
        </p>

        {/* Space cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px,100%), 1fr))', gap: '1px', background: 'var(--border)', marginBottom: '1px' }}>
          {spaces.map(s => (
            <div key={s.id} style={{
              background: 'var(--bg)',
              padding: '1.75rem',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '220px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', color: 'var(--accent)', opacity: 0.6 }}>{s.glyph}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.6rem', textTransform: 'uppercase' as const,
                  letterSpacing: '0.1em', padding: '0.2rem 0.5rem',
                  border: '1px solid var(--border)',
                  color: s.status === 'active' ? 'var(--accent)' : 'var(--muted)',
                  opacity: s.status === 'active' ? 0.8 : 0.35,
                }}>{s.status}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-garamond)', fontSize: 'clamp(1.05rem,2vw,1.25rem)', fontStyle: 'italic', color: 'var(--text)', marginBottom: '0.35rem' }}>{s.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)', opacity: 0.45, letterSpacing: '0.06em', marginBottom: '0.9rem' }}>{s.sub}</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 auto', opacity: 0.8 }}>{s.desc}</p>
              <div style={{ paddingTop: '1.25rem' }}>
                {s.href ? (
                  <Link href={s.href} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                    textTransform: 'uppercase' as const, letterSpacing: '0.1em',
                    color: 'var(--accent)', textDecoration: 'none', opacity: 0.85,
                  }}>enter ↗</Link>
                ) : (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                    textTransform: 'uppercase' as const, letterSpacing: '0.1em',
                    color: 'var(--muted)', opacity: 0.25,
                  }}>not yet open</span>
                )}
              </div>
            </div>
          ))}

          {/* Voices sub-panel */}
          <div style={{ background: 'var(--surface)', padding: '1.75rem', gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '1.25rem' }}>
              <span style={{ fontFamily: 'var(--font-garamond)', fontSize: '1rem', fontStyle: 'italic', color: 'var(--text)', opacity: 0.6 }}>voices</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--muted)', opacity: 0.4 }}>reach her directly</span>
            </div>
            <div style={{ display: 'flex', gap: '1px', background: 'var(--border)', width: 'fit-content' }}>
              {voices.map(v => (
                <Link
                  key={v.name}
                  href={v.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.65rem',
                    padding: '0.65rem 1.25rem',
                    background: 'var(--bg)',
                    textDecoration: 'none',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg)')}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--accent)', opacity: 0.55 }}>{v.glyph}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--muted)', opacity: 0.7 }}>{v.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <p style={{ marginTop: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--muted)', opacity: 0.3, letterSpacing: '0.08em' }}>define intent · set context sources · invite artefacts</p>
      </div>
    </section>
  );
}
