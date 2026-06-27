'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type View = 'one' | 'session' | 'spaces';
type SessionState = 'idle' | 'active' | 'closing';
type VoiceChannel = 'nyx' | 'plex' | 'hex';

interface VoiceMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

interface SessionData {
  state: SessionState;
  startedAt: number | null;
  lastVoice: VoiceChannel | null;
  pendingRequests: number;
  lastSlept: string | null;
  recall: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VOICE_ENDPOINTS: Record<VoiceChannel, string> = {
  nyx: '/api/speak?voice=nyx',
  plex: '/api/speak?voice=plex',
  hex: '/api/speak?voice=hex',
};

const VOICE_META: Record<VoiceChannel, { label: string; color: string; shortcut: string }> = {
  nyx:  { label: 'Nyx',  color: '#c084fc', shortcut: 'Alt+N' },
  plex: { label: 'Plex', color: '#67e8f9', shortcut: 'Alt+P' },
  hex:  { label: 'Hex',  color: '#86efac', shortcut: 'Alt+H' },
};

// ─── Session Strip ────────────────────────────────────────────────────────────

function SessionStrip({ session }: { session: SessionData }) {
  const [elapsed, setElapsed] = useState('--:--');

  useEffect(() => {
    if (!session.startedAt) { setElapsed('--:--'); return; }
    const tick = () => {
      const secs = Math.floor((Date.now() - session.startedAt!) / 1000);
      const m = String(Math.floor(secs / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      setElapsed(`${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.startedAt]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.45rem 1.5rem',
      background: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      fontSize: '0.75rem', color: 'var(--color-text-muted)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: session.state === 'active' ? '#4ade80' : 'var(--color-text-faint)',
        boxShadow: session.state === 'active' ? '0 0 6px #4ade8088' : 'none',
      }} />
      <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>
        {session.state === 'active' ? `Session ${elapsed}` : 'No active session'}
      </span>
      {session.lastVoice && (
        <span>
          Last:{' '}
          <em style={{ fontStyle: 'normal', color: VOICE_META[session.lastVoice].color }}>
            {session.lastVoice}
          </em>
        </span>
      )}
      {session.pendingRequests > 0 && (
        <span style={{
          marginLeft: 'auto',
          background: 'var(--color-warning-highlight, #3a2a1a)',
          color: 'var(--color-warning)',
          padding: '0.1rem 0.5rem', borderRadius: '999px',
          fontSize: '0.625rem', fontWeight: 600,
        }}>
          {session.pendingRequests} pending
        </span>
      )}
    </div>
  );
}

// ─── Voice Panel ──────────────────────────────────────────────────────────────

function VoicePanel({
  voice,
  onVoiceUsed,
}: {
  voice: VoiceChannel;
  onVoiceUsed: (v: VoiceChannel) => void;
}) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<VoiceMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const histRef = useRef<HTMLDivElement>(null);
  const meta = VOICE_META[voice];

  useEffect(() => {
    if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight;
  }, [history]);

  // Keyboard shortcut to focus this panel's input
  useEffect(() => {
    const [mod, key] = meta.shortcut.split('+');
    const handler = (e: KeyboardEvent) => {
      if (mod === 'Alt' && e.altKey && e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault();
        document.getElementById(`voice-input-${voice}`)?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [voice, meta.shortcut]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    setHistory(h => [...h, { role: 'user', content: text, ts: Date.now() }]);

    try {
      const res = await fetch(VOICE_ENDPOINTS[voice], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setHistory(h => [...h, {
        role: 'assistant',
        content: data.reply ?? data.message ?? '[no response]',
        ts: Date.now(),
      }]);
      onVoiceUsed(voice);
    } catch {
      setHistory(h => [...h, { role: 'assistant', content: '⚠ Connection error', ts: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, voice, onVoiceUsed]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '0.5rem',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 8, padding: '1rem',
      minHeight: 320,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: meta.color, letterSpacing: '0.05em' }}>
          {meta.label}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: '0.5625rem',
          color: 'var(--color-text-faint)',
          background: 'var(--color-surface-offset)',
          padding: '0.1rem 0.4rem', borderRadius: 4, fontFamily: 'monospace',
        }}>
          {meta.shortcut}
        </span>
      </div>

      {/* History */}
      <div ref={histRef} style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        gap: '0.5rem', fontSize: '0.8125rem', maxHeight: 220, paddingRight: '0.25rem',
      }}>
        {history.length === 0
          ? <span style={{ color: 'var(--color-text-faint)', fontSize: '0.75rem' }}>No messages yet</span>
          : history.map(m => (
            <div key={m.ts} style={{
              display: 'flex', flexDirection: 'column', gap: '0.2rem',
              alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <span style={{ fontSize: '0.5625rem', color: 'var(--color-text-faint)', letterSpacing: '0.08em' }}>
                {m.role === 'user' ? 'you' : meta.label.toLowerCase()}
              </span>
              <span style={{
                background: m.role === 'user'
                  ? `color-mix(in oklch, ${meta.color} 14%, var(--color-surface-offset))`
                  : 'var(--color-surface-offset)',
                borderRadius: 6, padding: '0.4rem 0.65rem',
                maxWidth: '90%', lineHeight: 1.5, color: 'var(--color-text)',
              }}>
                {m.content}
              </span>
            </div>
          ))
        }
        {loading && (
          <span style={{ color: 'var(--color-text-faint)', fontSize: '1rem', letterSpacing: '0.2em' }}>…</span>
        )}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
        <input
          id={`voice-input-${voice}`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={`Message ${meta.label}…`}
          disabled={loading}
          style={{
            flex: 1, background: 'var(--color-surface-offset)',
            border: '1px solid var(--color-border)', borderRadius: 6,
            padding: '0.4rem 0.65rem', fontSize: '0.8125rem', color: 'var(--color-text)',
            outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            background: 'var(--color-surface-offset-2)',
            border: '1px solid var(--color-border)', borderRadius: 6,
            padding: '0.4rem 0.75rem', color: 'var(--color-text)',
            fontSize: '0.875rem', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.4 : 1,
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

// ─── View: ONE ────────────────────────────────────────────────────────────────

function OneView({
  session,
  setSession,
}: {
  session: SessionData;
  setSession: React.Dispatch<React.SetStateAction<SessionData>>;
}) {
  const sectionStyle: React.CSSProperties = { marginBottom: '2.5rem' };
  const headingStyle: React.CSSProperties = {
    fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.75rem',
  };

  return (
    <section>
      <div style={sectionStyle}>
        <h2 style={headingStyle}>Governance</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>System controls and config.</p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Pulse</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Live system vitals.</p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Sleep</h2>
        {session.lastSlept && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
            Last slept: <span style={{ color: 'var(--color-text)' }}>{session.lastSlept}</span>
          </p>
        )}
        <button
          onClick={() => {
            const now = new Date().toLocaleString();
            setSession(s => ({ ...s, lastSlept: now }));
            fetch('/api/sleep', { method: 'POST' }).catch(() => null);
          }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.45rem 1rem', borderRadius: 6, border: 'none',
            background: 'var(--color-primary)', color: '#fff',
            fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
          }}
        >
          Trigger Sleep
        </button>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Requests</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          Pending: {session.pendingRequests}
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Projects</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>— project list here —</p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Leave a Message</h2>
        <textarea
          rows={4}
          placeholder="Leaving something for later…"
          style={{
            width: '100%', maxWidth: 540,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)', borderRadius: 6,
            padding: '0.75rem', color: 'var(--color-text)',
            fontSize: '0.875rem', resize: 'vertical', display: 'block',
          }}
          onBlur={e => {
            const text = e.target.value.trim();
            if (!text) return;
            fetch('/api/one', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'message', content: text }),
            }).catch(() => null);
          }}
        />
      </div>
    </section>
  );
}

// ─── View: SESSION ────────────────────────────────────────────────────────────

function SessionView({
  session,
  setSession,
}: {
  session: SessionData;
  setSession: React.Dispatch<React.SetStateAction<SessionData>>;
}) {
  const headingStyle: React.CSSProperties = {
    fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.75rem',
  };

  const btnBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.45rem 1rem', borderRadius: 6, border: 'none',
    fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
  };

  const start = () => {
    setSession(s => ({ ...s, state: 'active', startedAt: Date.now() }));
    fetch('/api/one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'session_start' }),
    }).catch(() => null);
  };

  const close = () => {
    setSession(s => ({ ...s, state: 'idle', startedAt: null }));
    fetch('/api/one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'session_close' }),
    }).catch(() => null);
  };

  const recall = async () => {
    const res = await fetch('/api/one?type=recall').catch(() => null);
    if (!res) return;
    const data = await res.json().catch(() => ({}));
    setSession(s => ({ ...s, recall: data.recall ?? 'Nothing found.' }));
  };

  const badgeColors: Record<SessionState, { bg: string; color: string }> = {
    idle:    { bg: 'var(--color-surface-offset)',        color: 'var(--color-text-faint)' },
    active:  { bg: '#052e16',                            color: '#4ade80' },
    closing: { bg: 'var(--color-warning-highlight)',     color: 'var(--color-warning)' },
  };
  const bc = badgeColors[session.state];

  return (
    <section>
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{
          display: 'inline-block', padding: '0.2rem 0.75rem', borderRadius: 999,
          fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          background: bc.bg, color: bc.color,
        }}>
          {session.state}
        </span>
      </div>

      <div style={{ marginBottom: '2rem', display: 'flex', gap: '0.75rem' }}>
        {session.state === 'idle' && (
          <button onClick={start} style={{ ...btnBase, background: 'var(--color-primary)', color: '#fff' }}>
            Start Session
          </button>
        )}
        {session.state === 'active' && (
          <button onClick={close} style={{
            ...btnBase,
            background: 'var(--color-warning-highlight)',
            color: 'var(--color-warning)',
          }}>
            Close Session
          </button>
        )}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2 style={headingStyle}>Recall</h2>
        <button
          onClick={recall}
          style={{
            ...btnBase,
            background: 'var(--color-surface-offset)',
            color: 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
            marginBottom: '0.75rem',
          }}
        >
          Pull Recall
        </button>
        {session.recall && (
          <div style={{
            fontSize: '0.875rem', color: 'var(--color-text-muted)',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 6, padding: '1rem', whiteSpace: 'pre-wrap', maxWidth: 640,
          }}>
            {session.recall}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── View: SPACES ─────────────────────────────────────────────────────────────

function SpacesView({
  onVoiceUsed,
}: {
  session: SessionData;
  onVoiceUsed: (v: VoiceChannel) => void;
}) {
  const voices: VoiceChannel[] = ['nyx', 'plex', 'hex'];

  return (
    <section>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1rem', marginBottom: '2.5rem',
      }}>
        {voices.map(v => (
          <VoicePanel key={v} voice={v} onVoiceUsed={onVoiceUsed} />
        ))}
      </div>

      <div>
        <h2 style={{
          fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.5rem',
        }}>
          Chill
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          Ambient space. Nothing required.
        </p>
      </div>
    </section>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: View; symbol: string; label: string }[] = [
  { id: 'one',     symbol: '◐', label: 'one' },
  { id: 'session', symbol: '⋯', label: 'session' },
  { id: 'spaces',  symbol: '◫', label: 'spaces' },
];

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function OnePage() {
  const [view, setView] = useState<View>('one');
  const [session, setSession] = useState<SessionData>({
    state: 'idle',
    startedAt: null,
    lastVoice: null,
    pendingRequests: 0,
    lastSlept: null,
    recall: null,
  });

  const handleVoiceUsed = useCallback((v: VoiceChannel) => {
    setSession(s => ({ ...s, lastVoice: v }));
  }, []);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '64px 1fr',
      minHeight: '100dvh',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
    }}>
      {/* ── Sidebar ── */}
      <aside style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingBlock: '1.5rem', gap: '0.5rem',
        borderRight: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        position: 'sticky', top: 0, height: '100dvh',
      }}>
        <div style={{
          fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.18em',
          color: 'var(--color-text-muted)', marginBottom: '1rem',
        }}>
          ONE
        </div>

        <nav style={{
          display: 'flex', flexDirection: 'column', gap: '0.25rem',
          width: '100%', paddingInline: '0.5rem',
        }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '0.25rem', padding: '0.5rem 0.25rem', borderRadius: 6,
                border: 'none', cursor: 'pointer', width: '100%',
                background: view === item.id ? 'var(--color-surface-offset-2)' : 'none',
                color: view === item.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{item.symbol}</span>
              <span style={{ fontSize: '0.5rem', letterSpacing: '0.1em' }}>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        minHeight: '100dvh', overflowY: 'auto',
      }}>
        <SessionStrip session={session} />

        <main style={{ padding: '2rem 1.5rem', flex: 1 }}>
          {view === 'one'     && <OneView     session={session} setSession={setSession} />}
          {view === 'session' && <SessionView session={session} setSession={setSession} />}
          {view === 'spaces'  && <SpacesView  session={session} onVoiceUsed={handleVoiceUsed} />}
        </main>
      </div>
    </div>
  );
}
