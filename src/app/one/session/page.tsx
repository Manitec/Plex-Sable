// src/app/one/session/page.tsx
// Session — standalone route
// Visual language aligned with ONE shell (CSS variables, not hardcoded hex)

'use client';

import { useState, useEffect, useRef } from 'react';

interface Message {
  id?: string;
  role: 'joe' | 'plex';
  content: string;
}

interface SessionState {
  id: string;
  intent: string;
  status: 'open' | 'closed';
  recallTagsLoaded: string[];
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.75rem' };
const muted: React.CSSProperties = { ...mono, color: 'var(--muted)' };

export default function SessionPage() {
  const [phase, setPhase] = useState<'start' | 'active' | 'closing' | 'review'>('start');
  const [intent, setIntent] = useState('');
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposedTags, setProposedTags] = useState<Record<string, string>>({});
  const [approvedTags, setApprovedTags] = useState<Record<string, string>>({});
  const [committed, setCommitted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function startSession() {
    if (!intent.trim()) return;
    setLoading(true);
    const res = await fetch('/api/one/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', intent }),
    });
    const data = await res.json();
    setSession({ id: data.sessionId, intent, status: 'open', recallTagsLoaded: data.recallTagsLoaded ?? [] });
    if (data.plexReply) setMessages([{ role: 'plex', content: data.plexReply }]);
    setPhase('active');
    setLoading(false);
  }

  async function sendMessage() {
    if (!input.trim() || !session) return;
    const userMsg: Message = { role: 'joe', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    const res = await fetch('/api/one/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'message', sessionId: session.id, content: userMsg.content }),
    });
    const data = await res.json();
    if (data.plexReply) setMessages(prev => [...prev, { role: 'plex', content: data.plexReply }]);
    setLoading(false);
  }

  async function closeSession() {
    if (!session) return;
    setPhase('closing');
    setLoading(true);
    const res = await fetch('/api/one/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', sessionId: session.id }),
    });
    const data = await res.json();
    const proposed = data.proposedTags ?? {};
    setProposedTags(proposed);
    setApprovedTags(proposed);
    setPhase('review');
    setLoading(false);
  }

  async function commitTags() {
    if (!session || Object.keys(approvedTags).length === 0) { setCommitted(true); return; }
    setLoading(true);
    await fetch('/api/one/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'commit_recall', tags: approvedTags }),
    });
    setCommitted(true);
    setLoading(false);
  }

  function toggleTag(key: string) {
    setApprovedTags(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = proposedTags[key];
      return next;
    });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
    background: 'oklch(from var(--bg) calc(l + 0.03) c h)',
    border: '1px solid var(--border)', color: 'var(--text)',
    padding: '0.75rem 1rem', resize: 'none', outline: 'none',
    lineHeight: 1.65, transition: 'border-color 140ms', borderRadius: '0.6rem',
  };

  const btnAccent: React.CSSProperties = {
    ...mono, padding: '0.55rem 1.25rem',
    background: 'var(--accent)', color: 'var(--bg)',
    border: 'none', cursor: 'pointer', borderRadius: '0.6rem',
    fontSize: '0.875rem', fontWeight: 700, transition: 'opacity 140ms',
  };

  const btnGhost: React.CSSProperties = {
    ...mono, padding: '0.35rem 0.8rem',
    background: 'transparent', color: 'var(--muted)',
    border: '1px solid var(--border)', cursor: 'pointer', borderRadius: '0.5rem',
    transition: 'all 140ms',
  };

  // ── Start ──────────────────────────────────────────────────────────────────
  if (phase === 'start') return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <p style={{ ...muted, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '0.5rem', color: 'var(--accent)', opacity: 0.8 }}>
          ONE · Session
        </p>
        <h1 style={{
          fontFamily: 'var(--font-serif, Georgia, serif)',
          fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 500,
          color: 'var(--text)', marginBottom: '0.5rem',
        }}>
          What are we working on?
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
          Plex will load matching recall context and stay scoped for this session.
        </p>
        <textarea
          rows={4}
          placeholder="e.g. plex-sable session panel build, joesfaves proxy fix, ecko-activation trigger logic..."
          value={intent}
          onChange={e => setIntent(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) startSession(); }}
          style={inputStyle}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/one" style={{ ...muted, opacity: 0.5, textDecoration: 'none', transition: 'opacity 140ms' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
            ← back to ONE
          </a>
          <button
            onClick={startSession}
            disabled={loading || !intent.trim()}
            style={{ ...btnAccent, opacity: loading || !intent.trim() ? 0.4 : 1 }}
          >
            {loading ? 'Starting…' : 'Start Session →'}
          </button>
        </div>
        <p style={{ ...muted, opacity: 0.35, marginTop: '0.75rem', textAlign: 'right' }}>⌘↵ to start</p>
      </div>
    </div>
  );

  // ── Review / Closing ───────────────────────────────────────────────────────
  if (phase === 'review' || phase === 'closing') return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        {phase === 'closing' ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Plex is reviewing the session…</p>
        ) : committed ? (
          <div>
            <p style={{ ...muted, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: '0.75rem' }}>
              Session closed
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              Recall tags {Object.keys(approvedTags).length > 0 ? 'committed to meta/recall.json.' : 'skipped.'}
            </p>
            <a href="/one" style={{ ...muted, opacity: 0.5, textDecoration: 'none', transition: 'opacity 140ms' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
              ← back to ONE
            </a>
          </div>
        ) : (
          <div>
            <p style={{ ...muted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: '0.5rem', color: 'var(--accent)', opacity: 0.8 }}>
              Session · Close
            </p>
            <h2 style={{ color: 'var(--text)', fontSize: '1.3rem', fontWeight: 400, marginBottom: '0.35rem' }}>
              Proposed recall tags
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              Toggle off any you don't want saved.
            </p>
            {Object.keys(proposedTags).length === 0 ? (
              <p style={{ ...muted, marginBottom: '1.5rem' }}>No new tags proposed.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
                {Object.entries(proposedTags).map(([key, value]) => (
                  <div
                    key={key}
                    onClick={() => toggleTag(key)}
                    style={{
                      cursor: 'pointer', borderRadius: '0.6rem',
                      border: `1px solid ${approvedTags[key] ? 'var(--accent)' : 'var(--border)'}`,
                      background: approvedTags[key] ? 'oklch(from var(--accent) l c h / 0.08)' : 'transparent',
                      padding: '0.6rem 0.75rem',
                      opacity: approvedTags[key] ? 1 : 0.5,
                      transition: 'all 140ms',
                    }}
                  >
                    <p style={{ ...mono, color: 'var(--accent)', marginBottom: '0.2rem' }}>{key}</p>
                    <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{value}</p>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button onClick={() => setCommitted(true)} style={{ ...btnGhost, border: 'none', opacity: 0.5 }}>Skip</button>
              <button onClick={commitTags} disabled={loading} style={{ ...btnAccent, opacity: loading ? 0.4 : 1 }}>
                {loading ? 'Saving…' : `Save ${Object.keys(approvedTags).length} tag${Object.keys(approvedTags).length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Active ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid var(--border)',
        background: 'oklch(from var(--bg) calc(l - 0.01) c h)',
        flexShrink: 0,
      }}>
        <div>
          <p style={{ ...muted, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', opacity: 0.7, marginBottom: '0.2rem' }}>
            ONE · Session
          </p>
          <p style={{ color: 'var(--text)', fontSize: '0.875rem', fontWeight: 500 }}>{session?.intent}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {session && session.recallTagsLoaded.length > 0 && (
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {session.recallTagsLoaded.map(tag => (
                <span key={tag} style={{
                  fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
                  background: 'oklch(from var(--accent) l c h / 0.12)',
                  color: 'var(--accent)', padding: '0.2rem 0.6rem', borderRadius: '999px',
                }}>{tag}</span>
              ))}
            </div>
          )}
          <button
            onClick={closeSession}
            style={btnGhost}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--muted)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
          >
            Close Session
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'joe' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '75%', borderRadius: '1.1rem',
              padding: '0.75rem 1rem', fontSize: '0.9rem', lineHeight: 1.65,
              background: msg.role === 'joe'
                ? 'oklch(from var(--accent) l c h / 0.14)'
                : 'oklch(from var(--bg) calc(l + 0.02) c h)',
              border: msg.role === 'plex' ? '1px solid var(--border)' : 'none',
              color: 'var(--text)',
            }}>
              {msg.role === 'plex' && (
                <p style={{ ...mono, color: 'var(--accent)', marginBottom: '0.3rem' }}>plex</p>
              )}
              <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              borderRadius: '1.1rem', padding: '0.75rem 1rem',
              background: 'oklch(from var(--bg) calc(l + 0.02) c h)',
              border: '1px solid var(--border)',
            }}>
              <p style={{ ...mono, color: 'var(--accent)', marginBottom: '0.3rem' }}>plex</p>
              <p style={{ ...muted, letterSpacing: '0.15em' }}>thinking…</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        borderTop: '1px solid var(--border)', padding: '0.75rem 1.25rem',
        flexShrink: 0,
        background: 'oklch(from var(--bg) calc(l - 0.01) c h)',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <textarea
            rows={2}
            placeholder="Message Plex…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            style={{ ...inputStyle, flex: 1 }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{ ...btnAccent, padding: '0.65rem 1.1rem', flexShrink: 0, opacity: loading || !input.trim() ? 0.4 : 1 }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
