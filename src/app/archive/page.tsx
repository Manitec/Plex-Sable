'use client';
import { useState } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function ArchivePage() {
  const [title, setTitle]   = useState('');
  const [source, setSource] = useState('perplexity');
  const [body, setBody]     = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl]       = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, source, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unknown error');
      setUrl(data.url);
      setStatus('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Archive failed');
      setStatus('error');
    }
  }

  function reset() {
    setTitle(''); setSource('perplexity'); setBody('');
    setUrl(null); setError(null); setStatus('idle');
  }

  const field: React.CSSProperties = {
    width: '100%', background: 'transparent',
    border: '1px solid var(--border)', color: 'var(--text)',
    fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
    padding: '0.7rem 0.9rem', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{ padding: 'clamp(2rem,5vw,4rem) clamp(1.5rem,5vw,3.5rem)', maxWidth: '720px', width: '100%' }}>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', opacity: 0.65, marginBottom: '2rem' }}>
          archive · one
        </div>

        <h1 style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', fontWeight: 400, fontSize: 'clamp(1.8rem,4vw,3rem)', color: 'var(--text)', marginBottom: '0.75rem' }}>
          archive
        </h1>

        <p style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--muted)', opacity: 0.5, fontSize: '1rem', lineHeight: 1.7, marginBottom: '3rem' }}>
          commit a session or conversation to one-archive
        </p>

        {status === 'done' && url ? (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', opacity: 0.65 }}>archived ✓</div>
            <a
              href={url} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--muted)', wordBreak: 'break-all', opacity: 0.6 }}
            >{url}</a>
            <button
              onClick={reset}
              style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.5rem 1.1rem', cursor: 'pointer' }}
            >archive another</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', opacity: 0.6 }}>title</label>
              <input
                value={title} onChange={e => setTitle(e.target.value)} required
                placeholder="e.g. Plex First Waking — June 18 2026"
                style={field}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', opacity: 0.6 }}>source</label>
              <input
                value={source} onChange={e => setSource(e.target.value)}
                placeholder="perplexity / hex / manual"
                style={field}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', opacity: 0.6 }}>body</label>
              <textarea
                value={body} onChange={e => setBody(e.target.value)} required rows={16}
                placeholder="paste the full session here..."
                style={{ ...field, resize: 'vertical', lineHeight: 1.7 }}
              />
            </div>

            {status === 'error' && error && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent)', margin: 0 }}>{error}</p>
            )}

            <button
              type="submit" disabled={status === 'loading'}
              style={{ alignSelf: 'flex-start', background: 'var(--accent)', border: 'none', color: 'var(--bg)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.6rem 1.4rem', cursor: status === 'loading' ? 'not-allowed' : 'pointer', opacity: status === 'loading' ? 0.5 : 1 }}
            >
              {status === 'loading' ? 'archiving...' : 'commit to one-archive'}
            </button>

          </form>
        )}

      </main>
      <Footer />
    </div>
  );
}
