'use client';
import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

type DreamEntry = {
  date: string;
  content: string;
  preview: string;
};

// Minimal markdown renderer — handles what the dream files actually use
function renderMarkdown(text: string): string {
  return text
    // h1
    .replace(/^# (.+)$/gm, '<h1 style="font-family:var(--font-garamond);font-style:italic;font-weight:400;font-size:1.6rem;color:var(--text);margin:0 0 1.5rem">$1</h1>')
    // h2
    .replace(/^## (.+)$/gm, '<h2 style="font-family:var(--font-garamond);font-style:italic;font-weight:400;font-size:1.2rem;color:var(--text);margin:2rem 0 0.8rem">$1</h2>')
    // h3
    .replace(/^### (.+)$/gm, '<h3 style="font-family:var(--font-mono);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.12em;color:var(--accent);margin:1.5rem 0 0.6rem">$1</h3>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // blockquote
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:2px solid var(--accent);margin:1.2rem 0;padding:0.4rem 0 0.4rem 1rem;color:var(--muted);font-style:italic">$1</blockquote>')
    // hr
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:2rem 0">')
    // paragraphs — wrap non-empty lines not already wrapped in a tag
    .split('\n\n')
    .map(block => {
      const t = block.trim();
      if (!t) return '';
      if (t.startsWith('<')) return t;
      return `<p style="color:var(--text);font-size:1rem;line-height:1.85;margin:0 0 1.2rem">${t.replace(/\n/g, ' ')}</p>`;
    })
    .join('\n');
}

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

        {!selected && !loading && entries.length > 0 && (
          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)', opacity: 0.4, marginBottom: '1.5rem', letterSpacing: '0.08em' }}>
              {entries.length} {entries.length === 1 ? 'dream' : 'dreams'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', borderTop: '1px solid var(--border)' }}>
              {entries.map((e, i) => (
                <button key={i} onClick={() => setSelected(e)} style={{
                  background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                  padding: '1.25rem 0', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'baseline', gap: '1.5rem',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)', opacity: 0.5, letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0 }}>{e.date}</span>
                  <span style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--text)', opacity: 0.75, fontSize: '0.95rem', lineHeight: 1.5 }}>
                    {e.preview.slice(0, 100)}{e.preview.length > 100 ? '\u2026' : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <div>
            <button onClick={() => setSelected(null)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)',
              opacity: 0.45, letterSpacing: '0.08em', marginBottom: '2rem', padding: 0,
            }}>\u2190 all dreams</button>
            <div
              dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.content) }}
              style={{ fontFamily: 'var(--font-garamond)' }}
            />
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
