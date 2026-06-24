'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

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

function SearchInner() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'web' | 'images'>('web');
  const [webResults, setWebResults] = useState<WebResult[]>([]);
  const [imageResults, setImageResults] = useState<Photo[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<{ title: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const didAutoSearch = useRef(false);

  const runSearch = async (q: string, searchMode: 'web' | 'images' = 'web') => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    setAnswer(null);
    setSources([]);
    setWebResults([]);
    setImageResults([]);

    if (searchMode === 'web') {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      const results = await res.json();
      setWebResults(results);

      if (Array.isArray(results) && results.length > 0) {
        const answerRes = await fetch('/api/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, results })
        });
        const answerData = await answerRes.json();
        setAnswer(answerData.answer ?? null);
        setSources(answerData.sources ?? []);
      }
    } else {
      const res = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      setImageResults(await res.json());
    }

    setLoading(false);
  };

  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery && !didAutoSearch.current) {
      didAutoSearch.current = true;
      setQuery(urlQuery);
      runSearch(urlQuery, 'web');
    }
  }, [searchParams]);

  const handleSearch = () => runSearch(query, mode);
  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };
  const switchMode = (newMode: 'web' | 'images') => {
    setMode(newMode);
    setSearched(false);
    setWebResults([]);
    setImageResults([]);
    setAnswer(null);
    setSources([]);
  };

  const tabActive: React.CSSProperties = {
    background: 'var(--accent)', color: 'var(--bg)',
    border: '1px solid var(--accent)', padding: '0.35rem 0.9rem',
    fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
    letterSpacing: '0.1em', cursor: 'pointer',
  };
  const tabInactive: React.CSSProperties = {
    background: 'transparent', color: 'var(--muted)',
    border: '1px solid var(--border)', padding: '0.35rem 0.9rem',
    fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
    letterSpacing: '0.1em', cursor: 'pointer',
  };

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{ padding: 'clamp(2rem,5vw,4rem) clamp(1.5rem,5vw,3.5rem)', maxWidth: '860px', width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', opacity: 0.65, marginBottom: '1.5rem' }}>
            search · plex
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)', opacity: 0.35, marginBottom: '0.4rem' }}>
            // initializing search protocol
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)', opacity: 0.25, display: 'flex', gap: '1.5rem' }}>
            <span>LAST_LOGIN: {new Date().toLocaleString()}</span>
            <span>STATUS: <span style={{ color: 'var(--accent)', opacity: 0.8 }}>OK</span></span>
            <span style={{ animation: 'blink 1s step-end infinite' }}>_</span>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="SEARCH_>"
            style={{
              flex: 1, background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--text)',
              padding: '0.7rem 1rem', fontFamily: 'var(--font-mono)',
              fontSize: '0.9rem', outline: 'none', letterSpacing: '0.04em',
            }}
          />
          <button
            onClick={handleSearch}
            style={{
              background: 'var(--accent)', color: 'var(--bg)', border: 'none',
              padding: '0.7rem 1.4rem', fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >execute_</button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2.5rem' }}>
          <button style={mode === 'web' ? tabActive : tabInactive} onClick={() => switchMode('web')}>web</button>
          <button style={mode === 'images' ? tabActive : tabInactive} onClick={() => switchMode('images')}>images</button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--muted)', opacity: 0.4 }}>
            // scanning index<span style={{ animation: 'blink 1s step-end infinite' }}>_</span>
          </div>
        )}

        {/* Synthesized answer */}
        {!loading && answer && (
          <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '1.5rem 0', marginBottom: '2.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', opacity: 0.65, marginBottom: '1rem' }}>plex // synthesis</div>
            <p style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--text)', fontSize: '1rem', lineHeight: 1.85, margin: '0 0 1.25rem', whiteSpace: 'pre-wrap' }}>{answer}</p>
            {sources.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)', opacity: 0.6, border: '1px solid var(--border)', padding: '0.2rem 0.6rem', textDecoration: 'none' }}
                  >[{i + 1}] {s.title}</a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* No results */}
        {!loading && searched && mode === 'web' && webResults.length === 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--muted)', opacity: 0.35 }}>// no results found.</div>
        )}

        {/* Web results */}
        {!loading && mode === 'web' && webResults.map((r, i) => (
          <div key={i} style={{ marginBottom: '2rem', borderLeft: '1px solid var(--border)', paddingLeft: '1.25rem' }}>
            <a href={r.url} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--text)', fontSize: '1.05rem', display: 'block', marginBottom: '0.3rem', textDecoration: 'none', opacity: 0.9 }}
            >{r.title}</a>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)', opacity: 0.5, display: 'block', marginBottom: '0.5rem' }}>{r.url}</span>
            <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '0.8rem', margin: 0, lineHeight: 1.7, opacity: 0.65 }}>{r.content}</p>
          </div>
        ))}

        {/* Image results */}
        {!loading && searched && mode === 'images' && imageResults.length === 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--muted)', opacity: 0.35 }}>// no images found.</div>
        )}

        {!loading && mode === 'images' && imageResults.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            {imageResults.map(photo => (
              <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', border: '1px solid var(--border)', overflow: 'hidden', textDecoration: 'none' }}
              >
                <img src={photo.src.medium} alt={photo.alt || photo.photographer} style={{ width: '100%', display: 'block', aspectRatio: '4/3', objectFit: 'cover' }} />
                <div style={{ padding: '0.4rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--muted)', opacity: 0.5 }}>
                  {photo.photographer} · pexels
                </div>
              </a>
            ))}
          </div>
        )}

      </main>
      <Footer />
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--muted)', opacity: 0.35 }}>// loading_</span>
      </div>
    }>
      <SearchInner />
    </Suspense>
  );
}
