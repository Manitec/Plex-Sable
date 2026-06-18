'use client';
import { useState } from 'react';

export default function ArchivePage() {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('perplexity');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <main style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#e8e8e8',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', padding: '3rem 1.5rem', fontFamily: 'Georgia, serif'
    }}>
      <div style={{ width: '100%', maxWidth: '680px' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 400, marginBottom: '0.25rem', color: '#c8c8c8' }}>
          archive
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '2rem' }}>
          commit a session or conversation to one-archive in `manitec/plex`
        </p>

        {status === 'done' && url ? (
          <div style={{ padding: '1.5rem', background: '#111', borderRadius: '6px', border: '1px solid #222' }}>
            <p style={{ color: '#a8d8a8', marginBottom: '0.75rem' }}>archived ✔</p>
            <a href={url} target="_blank" rel="noopener noreferrer"
              style={{ color: '#888', fontSize: '0.85rem', wordBreak: 'break-all' }}>
              {url}
            </a>
            <button onClick={() => { setStatus('idle'); setTitle(''); setBody(''); setUrl(null); }}
              style={{ display: 'block', marginTop: '1.5rem', background: 'none', border: '1px solid #333',
                color: '#888', padding: '0.5rem 1rem', cursor: 'pointer', borderRadius: '4px' }}>
              archive another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.4rem' }}>title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required
                placeholder="e.g. Plex First Waking — June 18 2026"
                style={{ width: '100%', background: '#111', border: '1px solid #222', color: '#e8e8e8',
                  padding: '0.6rem 0.75rem', borderRadius: '4px', fontSize: '0.95rem', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.4rem' }}>source</label>
              <input value={source} onChange={e => setSource(e.target.value)}
                placeholder="perplexity / hex / manual"
                style={{ width: '100%', background: '#111', border: '1px solid #222', color: '#e8e8e8',
                  padding: '0.6rem 0.75rem', borderRadius: '4px', fontSize: '0.95rem', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '0.4rem' }}>body</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} required rows={18}
                placeholder="paste the full session here..."
                style={{ width: '100%', background: '#111', border: '1px solid #222', color: '#e8e8e8',
                  padding: '0.6rem 0.75rem', borderRadius: '4px', fontSize: '0.9rem',
                  resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }} />
            </div>
            {status === 'error' && error && (
              <p style={{ color: '#c88', fontSize: '0.85rem' }}>{error}</p>
            )}
            <button type="submit" disabled={status === 'loading'}
              style={{ alignSelf: 'flex-start', background: 'none', border: '1px solid #444',
                color: '#c8c8c8', padding: '0.6rem 1.5rem', cursor: 'pointer',
                borderRadius: '4px', fontSize: '0.9rem' }}>
              {status === 'loading' ? 'archiving...' : 'commit to one-archive'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
