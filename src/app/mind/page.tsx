'use client';
import { useState } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export default function MindPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer('');
    setReasoning(null);
    setShowReasoning(false);
    setError('');
    try {
      const res = await fetch('/api/mind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setAnswer(data.answer);
        setReasoning(data.reasoning ?? null);
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  };

  const clear = () => {
    setQuestion('');
    setAnswer('');
    setReasoning(null);
    setShowReasoning(false);
    setError('');
  };

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 'clamp(4rem,10vw,8rem) clamp(1.5rem,5vw,3.5rem)', maxWidth: '820px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', opacity: 0.65, marginBottom: '2rem' }}>Plex / mind</div>
        <h1 style={{ fontSize: 'clamp(2rem,5vw,4rem)', fontWeight: 400, fontStyle: 'italic', color: 'var(--text)', marginBottom: '1rem', fontFamily: 'var(--font-garamond)' }}>mind</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '3rem', maxWidth: 520 }}>Give Plex a problem, a decision, or a question you can't stop thinking about. She reasons it through.</p>

        <textarea
          placeholder="what are you thinking about..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKey}
          rows={5}
          style={{ width: '100%', maxWidth: 640, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.8rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', resize: 'vertical', marginBottom: '1.5rem', outline: 'none', lineHeight: 1.6 }}
        />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)', opacity: 0.5, marginTop: '-1rem', marginBottom: '1.5rem' }}>ctrl+enter to submit</div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button
            onClick={handleSubmit}
            disabled={loading || !question.trim()}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.6rem 1.4rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
          >
            {loading ? 'thinking...' : 'think'}
          </button>
          {(answer || error) && (
            <button onClick={clear} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.6rem 1.4rem', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>clear</button>
          )}
        </div>

        {error && <p style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}

        {answer && (
          <div style={{ width: '100%', maxWidth: 680 }}>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', marginBottom: '2rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', opacity: 0.65, marginBottom: '1rem' }}>PLEX // MIND</div>
              <p style={{ color: 'var(--text)', fontSize: '1rem', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{answer}</p>
            </div>

            {reasoning && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button
                  onClick={() => setShowReasoning(!showReasoning)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '1rem' }}
                >
                  {showReasoning ? 'hide reasoning trace' : 'show reasoning trace'}
                </button>
                {showReasoning && (
                  <pre style={{ color: 'var(--muted)', fontSize: '0.78rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', opacity: 0.7, borderLeft: '2px solid var(--border)', paddingLeft: '1rem' }}>{reasoning}</pre>
                )}
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
