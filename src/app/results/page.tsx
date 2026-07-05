'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface WebResult {
  title: string;
  url: string;
  content: string;
}

// Plex Search SVG logo — half-circle mark + wordmark
const PlexSearchLogo = () => (
  <svg viewBox="0 0 160 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Plex Search" style={{ height: '28px', width: 'auto' }}>
    {/* Half-circle mark */}
    <path d="M14 4 A12 12 0 0 1 14 28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="14" cy="16" r="4" fill="currentColor" opacity="0.9" />
    {/* Wordmark */}
    <text x="32" y="21" fontFamily="'Courier New', monospace" fontSize="13" fill="currentColor" letterSpacing="0.18em" opacity="0.85">PLEX</text>
    <text x="76" y="21" fontFamily="'Courier New', monospace" fontSize="13" fill="currentColor" letterSpacing="0.18em" opacity="0.35">·</text>
    <text x="88" y="21" fontFamily="'Courier New', monospace" fontSize="13" fill="currentColor" letterSpacing="0.18em" opacity="0.5">SEARCH</text>
  </svg>
);

function ResultsInner() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WebResult[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<{ title: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [bootLine, setBootLine] = useState(0);
  const didAutoSearch = useRef(false);

  const bootLines = [
    '// initializing search protocol',
    '// secure channel established',
    '// ready_',
  ];

  // Boot sequence — only on first load, skip if auto-searching
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      // auto-search: skip boot animation
      setBootDone(true);
      return;
    }
    // manual landing: play boot
    let i = 0;
    const next = () => {
      if (i < bootLines.length) {
        setBootLine(i);
        i++;
        setTimeout(next, 380);
      } else {
        setTimeout(() => setBootDone(true), 300);
      }
    };
    next();
  }, []);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !didAutoSearch.current) {
      didAutoSearch.current = true;
      setQuery(q);
      runSearch(q);
    }
  }, [searchParams]);

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    setResults([]);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setError(data?.error ?? `error ${res.status}`);
      } else {
        setResults(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      setError(err?.message ?? 'search unreachable');
    }
    setLoading(false);
  };

  const runSynthesis = async () => {
    if (!results.length) return;
    setSynthesizing(true);
    try {
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, results })
      });
      const data = await res.json();
      if (res.ok && !data?.error) {
        setAnswer(data.answer ?? null);
        setSources(data.sources ?? []);
      }
    } catch {}
    setSynthesizing(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      didAutoSearch.current = true;
      runSearch(query);
    }
  };

  const status = error ? 'ERR_' : loading ? 'SCANNING_' : searched ? 'OK_' : 'READY_';
  const statusColor = error ? '#ff6b6b' : loading ? 'var(--muted)' : searched ? 'var(--accent)' : 'var(--muted)';

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font-mono)',
      padding: 'clamp(1.5rem, 4vw, 3rem) clamp(1.5rem, 6vw, 5rem)',
      maxWidth: '820px',
      margin: '0 auto',
      boxSizing: 'border-box',
    }}>

      {/* Header: Logo left, status right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
        <div style={{ color: 'var(--accent)' }}>
          <PlexSearchLogo />
        </div>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', color: statusColor, opacity: 0.6, textTransform: 'uppercase' }}>
          {status}
        </div>
      </div>

      {/* Boot sequence — only on manual landing */}
      {!bootDone && (
        <div style={{ marginBottom: '1.5rem' }}>
          {bootLines.slice(0, bootLine + 1).map((line, i) => (
            <div key={i} style={{
              fontSize: '0.65rem',
              color: 'var(--muted)',
              opacity: i === bootLine ? 0.5 : 0.2,
              letterSpacing: '0.1em',
              lineHeight: 2,
              transition: 'opacity 0.3s',
            }}>{line}</div>
          ))}
        </div>
      )}

      {/* QUERY / STATUS line — shown after search */}
      {searched && (
        <div style={{
          fontSize: '0.6rem',
          letterSpacing: '0.14em',
          color: 'var(--muted)',
          opacity: 0.4,
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '1.5rem',
        }}>
          <span>QUERY: <span style={{ color: 'var(--text)', opacity: 0.7 }}>{query}</span></span>
          <span>STATUS: <span style={{ color: statusColor }}>{status}</span></span>
        </div>
      )}

      {/* Search bar */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '2.5rem' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="query_›"
          autoFocus
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: '1.05rem',
            padding: '0.4rem 0',
            outline: 'none',
            letterSpacing: '0.03em',
          }}
        />
        <button
          onClick={() => { didAutoSearch.current = true; runSearch(query); }}
          disabled={loading}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: loading ? 'var(--muted)' : 'var(--accent)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            padding: '0.4rem 0.9rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            letterSpacing: '0.12em',
          }}
        >{loading ? '...' : 'run_'}</button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: '0.7rem', color: '#ff6b6b', marginBottom: '1.5rem', opacity: 0.8 }}>
          // {error}
        </div>
      )}

      {/* Scanning indicator */}
      {loading && (
        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', opacity: 0.3, marginBottom: '1.5rem' }}>
          // scanning<span style={{ animation: 'blink 1s step-end infinite' }}>_</span>
        </div>
      )}

      {/* Synthesis trigger */}
      {!loading && results.length > 0 && !answer && (
        <div style={{ marginBottom: '2rem' }}>
          <button
            onClick={runSynthesis}
            disabled={synthesizing}
            style={{
              background: 'transparent',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              padding: '0.35rem 0.9rem',
              cursor: synthesizing ? 'not-allowed' : 'pointer',
              letterSpacing: '0.12em',
              opacity: synthesizing ? 0.4 : 0.7,
            }}
          >{synthesizing ? '// synthesizing_' : '// ask plex to synthesize'}</button>
        </div>
      )}

      {/* Synthesis answer */}
      {answer && (
        <div style={{ borderLeft: '1px solid var(--accent)', paddingLeft: '1.25rem', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--accent)', opacity: 0.45, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>plex · synthesis</div>
          <p style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontStyle: 'italic', fontSize: '1rem', lineHeight: 1.85, margin: '0 0 1rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{answer}</p>
          {sources.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.58rem', color: 'var(--accent)', opacity: 0.45, border: '1px solid var(--border)', padding: '0.15rem 0.5rem', textDecoration: 'none' }}
                >[{i + 1}] {s.title}</a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No results */}
      {!loading && !error && searched && results.length === 0 && (
        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', opacity: 0.3 }}>// no results found.</div>
      )}

      {/* Results */}
      {!loading && results.map((r, i) => (
        <div key={i} style={{ marginBottom: '1.75rem' }}>
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--font-garamond, Georgia, serif)',
              fontStyle: 'italic',
              color: 'var(--text)',
              fontSize: '1.05rem',
              display: 'block',
              marginBottom: '0.2rem',
              textDecoration: 'none',
              opacity: 0.9,
            }}
          >{r.title}</a>
          <span style={{ fontSize: '0.58rem', color: 'var(--accent)', opacity: 0.35, display: 'block', marginBottom: '0.4rem' }}>{r.url}</span>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0, lineHeight: 1.7, opacity: 0.6 }}>{r.content}</p>
        </div>
      ))}

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        justifyContent: 'center',
        padding: '3rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.65rem',
        color: 'var(--muted)',
        opacity: 0.3,
      }}>
        <div>// initializing search protocol</div>
      </div>
    }>
      <ResultsInner />
    </Suspense>
  );
}
