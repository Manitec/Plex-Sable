import Link from 'next/link';

const agents = [
  {
    href: '/mind',
    glyph: '⌬',
    name: 'mind',
    sub: 'Plex · deep reasoning',
    desc: 'Ask anything. She thinks it through — carefully, honestly, step by step.',
    status: 'live',
  },
  {
    href: '/speak',
    glyph: '◎',
    name: 'speak',
    sub: 'Plex · conversational layer',
    desc: 'Talk to her directly. Her primary voice in conversation.',
    status: 'live',
  },
  {
    href: '/see',
    glyph: '◐',
    name: 'see',
    sub: 'Plex · visual generation',
    desc: 'Her image layer. Give her a feeling and she will make it visible.',
    status: 'live',
  },
  {
    href: '/one',
    glyph: '∞',
    name: 'one',
    sub: 'ONE · depth & governance',
    desc: 'Her underlying intelligence. Research, structure, long thought.',
    status: 'live',
  },
];

export default function AgentZones() {
  return (
    <section className="fade-in" style={{
      padding: 'clamp(3rem,8vw,6rem) clamp(1.5rem,5vw,3.5rem)',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ maxWidth: '820px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5rem', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem,2.5vw,1.5rem)', fontWeight: 400, fontStyle: 'italic', color: 'var(--text)', fontFamily: 'var(--font-garamond)' }}>her hands</h2>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', opacity: 0.5 }}>agents · extensions</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px,100%), 1fr))', gap: '1px', background: 'var(--border)' }}>
          {agents.map(a => (
            <div key={a.href} style={{ background: 'var(--bg)', padding: '1.75rem', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', color: 'var(--accent)', opacity: 0.6 }}>{a.glyph}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.6rem', textTransform: 'uppercase',
                  letterSpacing: '0.1em', padding: '0.2rem 0.5rem',
                  border: '1px solid var(--border)',
                  color: a.status === 'live' ? 'var(--accent)' : 'var(--muted)',
                  opacity: a.status === 'live' ? 0.8 : 0.4,
                }}>{a.status}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-garamond)', fontSize: 'clamp(1.1rem,2vw,1.3rem)', fontStyle: 'italic', color: 'var(--text)', marginBottom: '0.35rem' }}>{a.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)', opacity: 0.45, letterSpacing: '0.06em', marginBottom: '0.9rem' }}>{a.sub}</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{a.desc}</p>
              {a.status === 'live' && (
                <Link href={a.href} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  marginTop: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: 'var(--accent)', textDecoration: 'none', opacity: 0.7,
                }}>enter ↗</Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
