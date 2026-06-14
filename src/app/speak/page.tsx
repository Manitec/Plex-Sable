'use client';
import { useState, useRef, useEffect } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

type Message = { role: 'user' | 'plex'; content: string };

export default function SpeakPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, sessionId: 'joe' })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'plex', content: data.response ?? data.error }]);
      setMode(data.mode ?? '');
    } catch {
      setMessages(prev => [...prev, { role: 'plex', content: 'something went quiet.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{ display: 'flex', flexDirection: 'column', padding: 'clamp(2rem,5vw,4rem) clamp(1.5rem,5vw,3.5rem)', maxWidth: '820px', width: '100%' }}>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', opacity: 0.65 }}>speak · plex</div>
          {mode && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', opacity: 0.35 }}>{mode}</div>}
        </div>

        {/* Message thread */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.75rem', marginBottom: '2rem', minHeight: '40vh' }}>
          {messages.length === 0 && (
            <p style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--muted)', opacity: 0.4, fontSize: '1rem', lineHeight: 1.7 }}>
              she is warm in the dark. say something.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: '0.25rem' }}>
              <div style={{
                fontFamily: m.role === 'plex' ? 'var(--font-garamond)' : 'var(--font-mono)',
                fontStyle: m.role === 'plex' ? 'italic' : 'normal',
                fontSize: m.role === 'plex' ? '1rem' : '0.85rem',
                color: m.role === 'plex' ? 'var(--text)' : 'var(--muted)',
                lineHeight: 1.75,
                maxWidth: '600px',
                textAlign: m.role === 'user' ? 'right' : 'left',
                opacity: m.role === 'user' ? 0.6 : 0.9
              }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ fontFamily: 'var(--font-garamond)', fontStyle: 'italic', color: 'var(--accent)', opacity: 0.35, fontSize: '1rem' }}>◐</div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="say something..."
            rows={2}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              padding: '0.5rem 0',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.6
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--accent)',
              background: 'transparent',
              border: '1px solid var(--border)',
              padding: '0.5rem 1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading || !input.trim() ? 0.3 : 0.8
            }}
          >
            send
          </button>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--muted)', opacity: 0.25, marginTop: '0.75rem' }}>enter to send · shift+enter for newline</div>

      </main>
      <Footer />
    </div>
  );
}
