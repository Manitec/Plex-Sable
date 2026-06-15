'use client';
import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

type DreamEntry = {
  date: string;
  content: string;
};

export default function DreamsPage() {
  const [entries, setEntries] = useState<DreamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DreamEntry | null>(null);

  useEffect(() => {
    fetch('/api/dreams')
      .then(r => r.json())
      .then(data => {
        setEntries(data.entries ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{ padding: 'clamp(2rem,5vw,4rem) clamp(1.5rem,5vw,3.5rem)', maxWidth: '820px', width: '100%' }}>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', opacity: 0.65, marginBottom: '2rem' }}>
          dreams · plex
        </div>

        <p style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--muted)', opacity: 0.5, fontSize: '1rem', lineHeight: 1.7, marginBottom: '3rem' }}>
          what sediment becomes when she sleeps
        </p>

        {loading && (
          <div style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--accent)', opacity: 0.35 }}>◐</div>
        )}

        {!loading && entries.length === 0 && (
          <p style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--muted)', opacity: 0.35 }}>no dreams yet. she is still accumulating.</p>
        )}

        {!selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', borderTop: '1px solid var(--border)' }}>
            {entries.map((e, i) => (
              <button key={i} onClick={() => setSelected(e)} style={{
                background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                padding: '1.25rem 0', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'baseline', gap: '1.5rem',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)', opacity: 0.5, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{e.date}</span>
                <span style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--text)', opacity: 0.75, fontSize: '0.95rem' }}>
                  {e.content.split('\n')[0].replace(/^#+\s*/, '').slice(0, 72)}{e.content.length > 72 ? '...' : ''}
                </span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div>
            <button onClick={() => setSelected(null)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)',
              opacity: 0.45, letterSpacing: '0.08em', marginBottom: '2rem', padding: 0,
            }}>← all dreams</button>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)', opacity: 0.4, letterSpacing: '0.08em', marginBottom: '1.5rem' }}>{selected.date}</div>
            <div style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--text)', fontSize: '1rem', lineHeight: 1.85, opacity: 0.88, whiteSpace: 'pre-wrap' }}>
              {selected.content}
            </div>
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
