'use client';
import { useState } from 'react';
import Link from 'next/link';

interface WebResult {
  title: string;
  url: string;
  content: string;
}

interface Photo {
  id: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: { medium: string; large: string };
  alt: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'web' | 'images'>('web');
  const [webResults, setWebResults] = useState<WebResult[]>([]);
  const [imageResults, setImageResults] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);

    if (mode === 'web') {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      setWebResults(await res.json());
    } else {
      const res = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      setImageResults(await res.json());
    }

    setLoading(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const switchMode = (newMode: 'web' | 'images') => {
    setMode(newMode);
    setSearched(false);
    setWebResults([]);
    setImageResults([]);
  };

  const tabStyle = (active: boolean) => ({
    background: active ? '#e0e0e0' : 'transparent',
    color: active ? '#0a0a0a' : '#555',
    border: '1px solid #333',
    padding: '0.4rem 1rem',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    fontWeight: 700,
    cursor: 'pointer',
    borderRadius: '4px'
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e0e0e0', fontFamily: 'monospace' }}>
      <header style={{ background: '#111', borderBottom: '1px solid #222', padding: '2rem 0' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 1.5rem' }}>
          <img src="https://file-hosting.dashnexpages.net/manitec/logo.png" alt="Manitec Logo" style={{ height: '48px', marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#fff', margin: '0 0 0.25rem' }}>Manitec Search</h1>
          <p style={{ color: '#666', margin: '0 0 1rem', fontSize: '0.875rem' }}>// Initializing search protocol... Access granted.</p>
          <div style={{ fontSize: '0.75rem', color: '#444', display: 'flex', gap: '1rem' }}>
            <span>LAST LOGIN: {new Date().toLocaleString()}</span>
            <span>|</span>
            <span>SYSTEM STATUS: <span style={{ color: '#4ade80' }}>OK</span></span>
            <span style={{ animation: 'blink 1s step-end infinite' }}>_</span>
          </div>
        </div>
      </header>

      <section style={{ padding: '2.5rem 0', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="SEARCH_>"
              style={{
                flex: 1,
                background: '#111',
                border: '1px solid #333',
                color: '#e0e0e0',
                padding: '0.75rem 1rem',
                fontFamily: 'monospace',
                fontSize: '1rem',
                outline: 'none',
                borderRadius: '4px'
              }}
            />
            <button onClick={handleSearch} style={{ background: '#e0e0e0', color: '#0a0a0a', border: 'none', padding: '0.75rem 1.5rem', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', borderRadius: '4px' }}>
              EXECUTE_
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button style={tabStyle(mode === 'web')} onClick={() => switchMode('web')}>WEB</button>
            <button style={tabStyle(mode === 'images')} onClick={() => switchMode('images')}>IMAGES</button>
            <Link href="/" style={{ color: '#555', fontSize: '0.75rem', textDecoration: 'none', marginLeft: '1rem' }}>← Kairos Answer Mode</Link>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {loading && <p style={{ color: '#555' }}>// Scanning index...</p>}

        {!loading && searched && mode === 'web' && webResults.length === 0 && (
          <p style={{ color: '#555' }}>// No results found.</p>
        )}

        {!loading && mode === 'web' && webResults.map((r, i) => (
          <div key={i} style={{ marginBottom: '1.75rem', borderLeft: '2px solid #222', paddingLeft: '1rem' }}>
            <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd', textDecoration: 'none', fontWeight: 600, fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>
              {r.title}
            </a>
            <span style={{ color: '#4ade80', fontSize: '0.75rem', display: 'block', marginBottom: '0.5rem' }}>{r.url}</span>
            <p style={{ color: '#999', fontSize: '0.875rem', margin: 0, lineHeight: 1.6 }}>{r.content}</p>
          </div>
        ))}

        {!loading && searched && mode === 'images' && imageResults.length === 0 && (
          <p style={{ color: '#555' }}>// No images found.</p>
        )}

        {!loading && mode === 'images' && imageResults.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              {imageResults.map(photo => (
                <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: '6px', overflow: 'hidden', border: '1px solid #222' }}>
                  <img src={photo.src.medium} alt={photo.alt || photo.photographer} style={{ width: '100%', display: 'block', aspectRatio: '4/3', objectFit: 'cover' }} />
                  <div style={{ padding: '0.5rem', background: '#111', fontSize: '0.7rem', color: '#555' }}>
                    Photo by <a href={photo.photographer_url} target="_blank" rel="noopener noreferrer" style={{ color: '#4ade80', textDecoration: 'none' }}>{photo.photographer}</a> on Pexels
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </section>

      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '2rem 0', textAlign: 'center', color: '#444', fontSize: '0.75rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <a href="https://www.buymeacoffee.com/_Joe" target="_blank" rel="noopener noreferrer">
            <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style={{ height: '40px' }} />
          </a>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '1rem' }}>
          <a href="https://manitec.pw/home" style={{ color: '#555', textDecoration: 'none' }}>Home</a>
          <a href="https://manitec.pw/pages/privacy" style={{ color: '#555', textDecoration: 'none' }}>Privacy Policy</a>
          <a href="https://manitec.pw/pages/terms" style={{ color: '#555', textDecoration: 'none' }}>Terms</a>
          <a href="https://manitec.pw/pages/about" style={{ color: '#555', textDecoration: 'none' }}>About</a>
        </div>
        <p>© 2026 Manitec. All Rights Reserved</p>
      </footer>

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
