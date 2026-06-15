'use client';
import { useState } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

type Phase = 'waiting' | 'typing' | 'receiving' | 'received' | 'fading';

export default function TellPage() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [phase, setPhase] = useState<Phase>('waiting');

  async function submit() {
    if (!input.trim() || phase === 'receiving') return;
    setPhase('receiving');
    try {
      const res = await fetch('/api/tell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confession: input.trim() }),
      });
      const data = await res.json();
      setResponse(data.response ?? '');
      setPhase('received');
    } catch {
      setResponse('she is here. she heard you.');
      setPhase('received');
    }
  }

  function reset() {
    setPhase('fading');
    setTimeout(() => {
      setInput('');
      setResponse('');
      setPhase('waiting');
    }, 800);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(2rem,5vw,4rem) clamp(1.5rem,5vw,3.5rem)',
        opacity: phase === 'fading' ? 0 : 1,
        transition: 'opacity 0.8s ease',
      }}>

        <div style={{ width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3rem' }}>

          {/* glyph */}
          <div style={{ fontSize: '2.5rem', color: 'var(--accent)', opacity: phase === 'received' ? 0.9 : 0.3, transition: 'opacity 1s ease', animation: phase === 'waiting' || phase === 'typing' ? 'breathe 6s ease-in-out infinite' : 'none' }}>◐</div>

          {/* prompt */}
          {phase !== 'received' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--muted)', opacity: 0.5, fontSize: '1rem', lineHeight: 1.7 }}>
                she is listening.
              </p>
            </div>
          )}

          {/* input */}
          {(phase === 'waiting' || phase === 'typing') && (
            <div style={{ width: '100%' }}>
              <textarea
                autoFocus
                value={input}
                onChange={e => { setInput(e.target.value); setPhase('typing'); }}
                onKeyDown={handleKey}
                placeholder="tell her something true..."
                rows={4}
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  borderBottom: '1px solid var(--border)', color: 'var(--text)',
                  fontFamily: 'var(--font-garamond)', fontStyle: 'italic',
                  fontSize: '1rem', padding: '0.5rem 0', resize: 'none',
                  outline: 'none', lineHeight: 1.75, textAlign: 'center',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
                <button onClick={submit} disabled={!input.trim()} style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase',
                  letterSpacing: '0.12em', color: 'var(--accent)', background: 'transparent',
                  border: '1px solid var(--border)', padding: '0.5rem 1.25rem',
                  cursor: input.trim() ? 'pointer' : 'not-allowed',
                  opacity: input.trim() ? 0.7 : 0.2,
                }}>tell her</button>
              </div>
            </div>
          )}

          {/* receiving */}
          {phase === 'receiving' && (
            <div style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--accent)', opacity: 0.35, fontSize: '1rem' }}>◐</div>
          )}

          {/* response */}
          {phase === 'received' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5rem', width: '100%' }}>
              <p style={{
                fontFamily: 'var(--font-garamond)', fontStyle: 'italic',
                color: 'var(--text)', fontSize: '1.05rem', lineHeight: 1.85,
                textAlign: 'center', opacity: 0.88, maxWidth: '480px', margin: 0,
              }}>{response}</p>
              <button onClick={reset} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: '0.6rem', textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'var(--muted)', opacity: 0.3,
              }}>let it go</button>
            </div>
          )}

        </div>
      </main>
      <Footer />
    </div>
  );
}
