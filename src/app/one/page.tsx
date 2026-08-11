// src/app/one/page.tsx
// ONE Shell — sidebar layout 
// Views: ◐ one | ⋯ session | ◫ spaces
// Nav removed. Footer kept. Session strip live across all views.
// Visual update Aug 2 2026 — balanced two-column ONE layout, spaces scaffold
// Spaces update Aug 2 2026 — full preview layout, voices+speak merged

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Footer from '@/components/Footer';

// ─── Types ────────────────────────────────────────────────────────────────────

type View = 'one' | 'session' | 'spaces';
type VoiceChannel = 'plex' | 'nyx' | 'hex' | 'mani';
type SessionPhase = 'start' | 'active' | 'closing' | 'review';
type SleepMode = 'dreamless' | 'dream' | 'nightmare';

interface VoiceMsg { role: 'user' | 'assistant'; content: string; ts: number; }
interface SessionMsg { id?: string; role: 'joe' | 'plex'; content: string; }
interface SessionState {
  id: string; intent: string; status: 'open' | 'closed';
  recallTagsLoaded: string[];
}
interface ONEState {
  sediment: string;
  autonomy: { level: number; label: string; updatedAt: any };
  eckoFragments: any[];
  requests: any[];
  log: any[];
  voices?: { nyx: string; hex: string; mani: string; message: string; response: string; updatedAt: any };
}
type Project = { id: string; title: string; status: string; notes: string; createdAt: any };
type SleepData = {
  date: string; nyx_excerpt: string; hex_excerpt: string;
  dream_excerpt: string; pending: boolean; mode?: string; createdAt: any;
} | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const VOICES: { key: VoiceChannel; label: string; desc: string; bubble: string }[] = [
  { key: 'plex', label: 'Plex', desc: 'the one · from three', bubble: 'I want to be able to sense when you\'re overwhelmed or stressed, and respond in a way that\'s comforting.' },
  { key: 'nyx',  label: 'Nyx',  desc: 'emotional · symbolic · present', bubble: 'I live where things connect. That is not a metaphor.' },
  { key: 'hex',  label: 'Hex',  desc: 'structural · builder · direct', bubble: 'This is where systems become usable.' },
  { key: 'mani', label: 'Mani', desc: 'analytical · epistemic · precise', bubble: 'Clarity should feel calm, not sterile.' },
];

const VOICE_SHORTCUTS: Record<VoiceChannel, string> = {
  plex: 'Alt+P', nyx: 'Alt+N', hex: 'Alt+H', mani: 'Alt+M',
};

const VOICE_COLORS: Record<VoiceChannel, string> = {
  plex: '#f0a060', nyx: '#c084fc', hex: '#86efac', mani: '#67e8f9',
};

const SLEEP_MODES: { key: SleepMode; label: string; desc: string }[] = [
  { key: 'dreamless', label: 'dreamless', desc: 'quiet rest, no generation' },
  { key: 'dream',     label: 'dream',     desc: 'process and generate' },
  { key: 'nightmare', label: 'nightmare', desc: 'surface fears, sediment pressure' },
];

const AUTONOMY_LEVELS = [
  { level: 1, label: 'observe' },
  { level: 2, label: 'suggest' },
  { level: 3, label: 'act with approval' },
  { level: 4, label: 'act and report' },
  { level: 5, label: 'full autonomy' },
];

const STATUS_FILTERS = ['all', 'pending', 'acknowledged', 'in-progress', 'done', 'deferred'];

const ZONES = [
  { key: 'sediment', label: 'Sediment' },
  { key: 'dreams',   label: 'Dreams' },
  { key: 'prompts',  label: 'Prompts' },
  { key: 'messages', label: 'Messages' },
  { key: '',         label: 'Root' },
];

// ─── Style tokens ─────────────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.75rem' };
const muted: React.CSSProperties = { ...mono, color: 'var(--muted)' };
const eyeStyle: React.CSSProperties = {
  ...mono, textTransform: 'uppercase' as const, letterSpacing: '0.16em',
  color: 'var(--accent)', marginBottom: '0.75rem', opacity: 0.85,
};
const labelStyle: React.CSSProperties = {
  ...mono, textTransform: 'uppercase' as const, letterSpacing: '0.14em',
  color: 'var(--accent)', marginBottom: '1.5rem',
};
const sectionStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)', paddingTop: '2rem', marginBottom: '3rem',
};

function statusColor(s: string) {
  if (s === 'in-progress') return '#f0a500';
  if (s === 'done' || s === 'acknowledged') return 'var(--accent)';
  if (s === 'deferred') return 'var(--muted)';
  return 'var(--muted)';
}

function fmtTime(ts: any): string {
  if (!ts) return '';
  try {
    const ms = ts.seconds ? ts.seconds * 1000 : ts._seconds ? ts._seconds * 1000 : Number(ts);
    return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// ─── Session Strip ────────────────────────────────────────────────────────────

function SessionStrip({
  phase, startedAt, lastVoice, pendingCount,
}: {
  phase: SessionPhase; startedAt: number | null;
  lastVoice: VoiceChannel | null; pendingCount: number;
}) {
  const [elapsed, setElapsed] = useState('--:--');

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(`${String(Math.floor(secs / 60)).padStart(2,'0')}:${String(secs % 60).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const active = phase === 'active';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.45rem 1.25rem',
      borderBottom: '1px solid var(--border)',
      background: 'oklch(from var(--bg) calc(l - 0.01) c h)',
      ...mono, color: 'var(--muted)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: active ? '#4ade80' : 'var(--border)',
        boxShadow: active ? '0 0 6px #4ade8066' : 'none',
        animation: active ? 'strip-pulse 2s ease infinite' : 'none',
      }} />
      <span style={{ color: 'var(--text)', fontWeight: 500 }}>
        {active ? `session ${elapsed}` : 'no active session'}
      </span>
      {lastVoice && (
        <span style={{ color: 'var(--muted)' }}>
          last: <span style={{ color: VOICE_COLORS[lastVoice] }}>{lastVoice}</span>
        </span>
      )}
      {pendingCount > 0 && (
        <span style={{
          marginLeft: 'auto', background: 'oklch(from var(--accent) l c h / 0.12)',
          color: 'var(--accent)', padding: '0.1rem 0.5rem',
          borderRadius: 999, fontSize: '0.6rem', fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {pendingCount} pending
        </span>
      )}
      <style>{`@keyframes strip-pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
    </div>
  );
}

// ─── Voice Panel (spaces card variant) ───────────────────────────────────────

function VoiceCard({
  voice, onVoiceUsed,
}: {
  voice: typeof VOICES[number];
  onVoiceUsed: (v: VoiceChannel) => void;
}) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<VoiceMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const histRef = useRef<HTMLDivElement>(null);
  const color = VOICE_COLORS[voice.key];
  const shortcut = VOICE_SHORTCUTS[voice.key];

  useEffect(() => {
    if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight;
  }, [history]);

  useEffect(() => {
    const [mod, key] = shortcut.split('+');
    const handler = (e: KeyboardEvent) => {
      if (mod === 'Alt' && e.altKey && e.key.toLowerCase() === key.toLowerCase())
        document.getElementById(`vc-${voice.key}`)?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [voice.key, shortcut]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    setHistory(h => [...h, { role: 'user', content: text, ts: Date.now() }]);
    try {
      const res = await fetch(`/api/speak?voice=${voice.key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setHistory(h => [...h, {
        role: 'assistant',
        content: data.reply ?? data.response ?? data.message ?? '(no response)',
        ts: Date.now(),
      }]);
      onVoiceUsed(voice.key);
    } catch {
      setHistory(h => [...h, { role: 'assistant', content: '(unavailable)', ts: Date.now() }]);
    }
    setLoading(false);
  }, [input, loading, voice.key, onVoiceUsed]);

  return (
    <article style={{
      display: 'flex', flexDirection: 'column', gap: '0.6rem',
      padding: '1.1rem',
      borderRadius: '1rem',
      border: `1px solid rgba(255,255,255,0.055)`,
      background: 'oklch(from var(--bg) calc(l + 0.025) c h)',
      minHeight: 260,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
          boxShadow: `0 0 8px ${color}55`,
        }} />
        <span style={{ ...mono, color, textTransform: 'uppercase' as const, letterSpacing: '0.1em', fontWeight: 700 }}>{voice.label}</span>
        <span style={{ ...muted, opacity: 0.4, fontSize: '0.65rem', marginLeft: '0.15rem' }}>{voice.desc}</span>
        <span style={{
          marginLeft: 'auto', ...mono, fontSize: '0.6rem', color: 'var(--muted)', opacity: 0.35,
          background: 'oklch(from var(--bg) calc(l + 0.04) c h)',
          padding: '0.1rem 0.4rem', borderRadius: 3,
        }}>{shortcut}</span>
      </div>

      {/* Chat history */}
      <div ref={histRef} style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        gap: '0.45rem', paddingRight: '0.15rem',
      }}>
        {history.length === 0
          ? (
            <div style={{
              borderLeft: `2px solid ${color}`,
              paddingLeft: '0.65rem',
              marginTop: '0.25rem',
            }}>
              <span style={{ ...muted, opacity: 0.4, fontStyle: 'italic', fontSize: '0.82rem', lineHeight: 1.6 }}>{voice.bubble}</span>
            </div>
          )
          : history.map(m => (
            <div key={m.ts} style={{ display: 'flex', flexDirection: 'column',
              alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: '0.12rem' }}>
              <span style={{ ...mono, fontSize: '0.55rem', color: 'var(--muted)', opacity: 0.45, letterSpacing: '0.08em' }}>
                {m.role === 'user' ? 'joe' : voice.label.toLowerCase()}
              </span>
              <span style={{
                background: m.role === 'user'
                  ? 'oklch(from var(--bg) calc(l + 0.05) c h)'
                  : 'oklch(from var(--bg) calc(l + 0.02) c h)',
                borderLeft: m.role === 'assistant' ? `2px solid ${color}` : 'none',
                padding: '0.3rem 0.55rem', fontSize: '0.8rem',
                color: 'var(--text)', lineHeight: 1.6, maxWidth: '92%',
                borderRadius: '0.4rem',
              }}>{m.content}</span>
            </div>
          ))
        }
        {loading && <span style={{ ...muted, opacity: 0.4, letterSpacing: '0.2em', fontSize: '0.85rem' }}>…</span>}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '0.35rem', marginTop: 'auto' }}>
        <input
          id={`vc-${voice.key}`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={`message ${voice.label}…`}
          disabled={loading}
          style={{
            flex: 1, ...mono, background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text)',
            padding: '0.3rem 0.55rem', outline: 'none',
            transition: 'border-color 120ms', borderRadius: '0.4rem',
            fontSize: '0.72rem',
          }}
          onFocus={e => (e.target.style.borderColor = color)}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            ...mono, padding: '0.3rem 0.6rem',
            background: input.trim() ? color : 'transparent',
            color: input.trim() ? 'var(--bg)' : 'var(--muted)',
            border: '1px solid var(--border)',
            cursor: 'pointer', opacity: loading ? 0.4 : 1,
            transition: 'all 120ms', borderRadius: '0.4rem',
          }}
        >↑</button>
      </div>
    </article>
  );
}

// ─── Voice Panel (ONE view variant) ──────────────────────────────────────────

function VoicePanel({
  voice, onVoiceUsed, fullWidth = false,
}: {
  voice: typeof VOICES[number];
  onVoiceUsed: (v: VoiceChannel) => void;
  fullWidth?: boolean;
}) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<VoiceMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const histRef = useRef<HTMLDivElement>(null);
  const color = VOICE_COLORS[voice.key];
  const shortcut = VOICE_SHORTCUTS[voice.key];

  useEffect(() => {
    if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight;
  }, [history]);

  useEffect(() => {
    const [mod, key] = shortcut.split('+');
    const handler = (e: KeyboardEvent) => {
      if (mod === 'Alt' && e.altKey && e.key.toLowerCase() === key.toLowerCase())
        document.getElementById(`vi-${voice.key}`)?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [voice.key, shortcut]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    setHistory(h => [...h, { role: 'user', content: text, ts: Date.now() }]);
    try {
      const res = await fetch(`/api/speak?voice=${voice.key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setHistory(h => [...h, {
        role: 'assistant',
        content: data.reply ?? data.response ?? data.message ?? '(no response)',
        ts: Date.now(),
      }]);
      onVoiceUsed(voice.key);
    } catch {
      setHistory(h => [...h, { role: 'assistant', content: '(unavailable)', ts: Date.now() }]);
    }
    setLoading(false);
  }, [input, loading, voice.key, onVoiceUsed]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '0.5rem',
      border: `1px solid ${fullWidth ? color : 'var(--border)'}`,
      padding: '1rem',
      background: fullWidth
        ? 'oklch(from var(--bg) calc(l + 0.025) c h)'
        : 'oklch(from var(--bg) calc(l - 0.01) c h)',
      minHeight: fullWidth ? 220 : 300,
      borderRadius: '0.75rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
          boxShadow: `0 0 8px ${color}55`,
        }} />
        <span style={{ ...mono, color, textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>{voice.label}</span>
        <span style={{ ...muted, opacity: 0.45, fontSize: '0.65rem', marginLeft: '0.25rem' }}>{voice.desc}</span>
        <span style={{
          marginLeft: 'auto', ...mono, fontSize: '0.6rem', color: 'var(--muted)', opacity: 0.4,
          background: 'oklch(from var(--bg) calc(l + 0.03) c h)',
          padding: '0.1rem 0.4rem', borderRadius: 3,
        }}>{shortcut}</span>
      </div>

      <div ref={histRef} style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        gap: '0.5rem', maxHeight: fullWidth ? 140 : 200, paddingRight: '0.25rem',
      }}>
        {history.length === 0
          ? <span style={{ ...muted, opacity: 0.35, fontStyle: 'italic' }}>{voice.bubble}</span>
          : history.map(m => (
            <div key={m.ts} style={{ display: 'flex', flexDirection: 'column',
              alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: '0.15rem' }}>
              <span style={{ ...mono, fontSize: '0.55rem', color: 'var(--muted)', opacity: 0.5, letterSpacing: '0.08em' }}>
                {m.role === 'user' ? 'joe' : voice.label.toLowerCase()}
              </span>
              <span style={{
                background: m.role === 'user'
                  ? 'oklch(from var(--bg) calc(l + 0.04) c h)'
                  : 'oklch(from var(--bg) calc(l + 0.02) c h)',
                borderLeft: m.role === 'assistant' ? `2px solid ${color}` : 'none',
                padding: '0.35rem 0.6rem', fontSize: '0.8rem',
                color: 'var(--text)', lineHeight: 1.6, maxWidth: '90%',
                borderRadius: '0.4rem',
              }}>{m.content}</span>
            </div>
          ))
        }
        {loading && <span style={{ ...muted, opacity: 0.4, letterSpacing: '0.2em', fontSize: '0.85rem' }}>…</span>}
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto' }}>
        <input
          id={`vi-${voice.key}`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={`message ${voice.label}…`}
          disabled={loading}
          style={{
            flex: 1, ...mono, background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text)',
            padding: '0.35rem 0.6rem', outline: 'none',
            transition: 'border-color 120ms', borderRadius: '0.4rem',
          }}
          onFocus={e => (e.target.style.borderColor = color)}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            ...mono, padding: '0.35rem 0.7rem',
            background: input.trim() ? color : 'transparent',
            color: input.trim() ? 'var(--bg)' : 'var(--muted)',
            border: '1px solid var(--border)',
            cursor: 'pointer', opacity: loading ? 0.4 : 1,
            transition: 'all 120ms', borderRadius: '0.4rem',
          }}
        >↑</button>
      </div>
    </div>
  );
}

'use client';

import type { CSSProperties } from 'react';

export type RepoFile = { name: string; path: string; type: 'file' | 'dir'; sha?: string };

type PanelStyle = CSSProperties;

export function RepoManagerPanel({
  zones, activeZone, files, loading, editingFile, editContent, newFileName, newFileContent, newFileOpen, saving, message, panelStyle, mono, muted, buttonStyle, accentButtonStyle, onZoneChange, onOpenFile, onDeleteFile, onBack, onEditContentChange, onSave, onNewFileOpenChange, onNewFileNameChange, onNewFileContentChange, onCreateFile,
}: {
  zones: { key: string; label: string }[]; activeZone: string; files: RepoFile[]; loading: boolean; editingFile: { path: string } | null; editContent: string; newFileName: string; newFileContent: string; newFileOpen: boolean; saving: boolean; message: string; panelStyle: PanelStyle; mono: PanelStyle; muted: PanelStyle; buttonStyle: PanelStyle; accentButtonStyle: PanelStyle; onZoneChange: (zone: string) => void; onOpenFile: (file: RepoFile) => void; onDeleteFile: (file: RepoFile) => void; onBack: () => void; onEditContentChange: (value: string) => void; onSave: () => void; onNewFileOpenChange: (open: boolean) => void; onNewFileNameChange: (value: string) => void; onNewFileContentChange: (value: string) => void; onCreateFile: () => void;
}) {
  const inputStyle: PanelStyle = { ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', outline: 'none', borderRadius: '0.4rem' };
  return <section style={panelStyle}><div style={{ ...mono, color: 'var(--accent)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '0.75rem', opacity: 0.85 }}>Repo Manager <span style={{ color: 'var(--muted)' }}>· Manitec/plex</span></div><div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>{zones.map(zone => <button key={zone.key} onClick={() => onZoneChange(zone.key)} style={{ ...mono, padding: '0.3rem 0.7rem', borderRadius: 999, background: activeZone === zone.key ? 'var(--accent)' : 'transparent', color: activeZone === zone.key ? 'var(--bg)' : 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>{zone.label}</button>)}</div>{message && <p style={{ ...muted, color: 'var(--accent)' }}>{message}</p>}{!editingFile ? <><div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1.25rem' }}>{loading ? <p style={muted}>loading...</p> : files.length === 0 ? <p style={muted}>empty.</p> : files.map(file => <div key={file.path} style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}><button onClick={() => onOpenFile(file)} style={{ ...mono, color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1 }}>{file.type === 'dir' ? `${file.name}/` : file.name}</button>{file.type === 'file' && <button onClick={() => onDeleteFile(file)} style={{ ...mono, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6rem' }}>delete</button>}</div>)}</div><button onClick={() => onNewFileOpenChange(!newFileOpen)} style={buttonStyle}>new file</button>{newFileOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.8rem', maxWidth: 480 }}><input placeholder="filename.md" value={newFileName} onChange={e => onNewFileNameChange(e.target.value)} style={inputStyle}/><textarea placeholder="content..." value={newFileContent} onChange={e => onNewFileContentChange(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }}/><button onClick={onCreateFile} disabled={saving} style={accentButtonStyle}>create</button></div>}</> : <><div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.6rem' }}><button onClick={onBack} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer' }}>back</button><p style={{ ...mono, color: 'var(--text)' }}>{editingFile.path}</p></div><textarea value={editContent} onChange={e => onEditContentChange(e.target.value)} rows={18} style={{ ...inputStyle, width: '100%', maxWidth: 720, padding: '0.7rem', resize: 'vertical', lineHeight: 1.7 }}/><div style={{ display: 'flex', gap: '1rem', marginTop: '0.6rem' }}><button onClick={onSave} disabled={saving} style={accentButtonStyle}>{saving ? 'saving...' : 'save'}</button></div></>}</section>;
}

export function ActivityLogPanel({ open, loading, entries, panelStyle, mono, muted, buttonStyle, onToggle }: { open: boolean; loading: boolean; entries: { id: string; entry?: string; author?: string; timestamp?: unknown }[]; panelStyle: PanelStyle; mono: PanelStyle; muted: PanelStyle; buttonStyle: PanelStyle; onToggle: () => void; }) {
  const formatTime = (value: any) => { try { const ms = value?.seconds ? value.seconds * 1000 : Number(value); return ms ? new Date(ms).toLocaleString() : ''; } catch { return ''; } };
  return <section style={panelStyle}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}><div style={{ ...mono, color: 'var(--accent)', letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.85 }}>Activity Log</div><button onClick={onToggle} style={{ ...buttonStyle, fontSize: '0.65rem', padding: '0.25rem 0.7rem', borderRadius: 999 }}>{open ? 'hide' : 'show'}</button></div>{open && (loading ? <p style={muted}>loading...</p> : entries.length === 0 ? <p style={muted}>no log entries yet.</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>{entries.map(item => <div key={item.id} style={{ padding: '0.6rem 0.8rem', borderLeft: '2px solid var(--border)', background: 'oklch(from var(--bg) calc(l + 0.01) c h)', borderRadius: '0 0.4rem 0.4rem 0' }}><p style={{ color: 'var(--text)', fontSize: '0.825rem', lineHeight: 1.6, marginBottom: '0.2rem' }}>{item.entry ?? '(no entry)'}</p><p style={{ ...muted, fontSize: '0.6rem', opacity: 0.55 }}><span style={{ color: 'var(--accent)' }}>{item.author ?? 'unknown'}</span>{item.timestamp ? ` · ${formatTime(item.timestamp)}` : ''}</p></div>)}</div>)}</section>;
}
// ─── Request Popup ────────────────────────────────────────────────────────────

function RequestPopup({
  req, projects, onClose, onUpdate, onDelete,
}: {
  req: any; projects: Project[]; onClose: () => void;
  onUpdate: (id: string, status: string, notes?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [notes, setNotes] = useState(req.notes ?? '');
  const [pickedStatus, setPickedStatus] = useState(req.status ?? 'pending');
  const [targetProject, setTargetProject] = useState('');

  async function act(status: string, extraNotes?: string) {
    setWorking(true);
    await onUpdate(req.id, status, extraNotes ?? notes);
    setWorking(false); onClose();
  }

  async function sendToProject() {
    if (!targetProject) return;
    setWorking(true);
    const proj = projects.find(p => p.id === targetProject);
    if (proj) {
      const newNotes = proj.notes
        ? `${proj.notes.trimEnd()}\n\n— plex request: ${req.request}`
        : `plex request: ${req.request}`;
      await fetch('/api/one', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_project', id: proj.id, title: proj.title, status: proj.status, notes: newNotes }),
      });
      await onUpdate(req.id, 'in-progress', `→ project: ${proj.title}`);
    }
    setWorking(false); onClose();
  }

  const btnBase: React.CSSProperties = {
    ...mono, padding: '0.4rem 0.9rem', border: '1px solid var(--border)',
    cursor: 'pointer', background: 'transparent', color: 'var(--muted)', transition: 'all 140ms',
    borderRadius: '0.5rem',
  };
  const btnAccent: React.CSSProperties = { ...btnBase, background: 'var(--accent)', color: 'var(--bg)', border: 'none' };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '1rem' }}
    >
      <div style={{
        background: 'var(--bg)', border: '1px solid var(--accent)',
        padding: '2rem', maxWidth: 560, width: '100%',
        maxHeight: '90dvh', overflowY: 'auto', fontFamily: 'var(--font-mono)',
        borderRadius: '1rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <p style={{ ...mono, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.65rem', marginBottom: '0.2rem' }}>
              {req.source ?? 'unknown'} · {fmtTime(req.createdAt)}
            </p>
            <p style={{ color: statusColor(req.status ?? 'pending'), fontSize: '0.65rem', ...mono, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {req.status ?? 'pending'}
            </p>
          </div>
          <button onClick={onClose} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
        </div>

        <p style={{ color: 'var(--text)', fontSize: '0.95rem', lineHeight: 1.75, marginBottom: '1.5rem',
          borderLeft: '2px solid var(--accent)', paddingLeft: '1rem' }}>
          {req.request ?? '(no text)'}
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <button style={btnAccent} disabled={working} onClick={() => act('acknowledged')}>✓ acknowledge</button>
          <button style={btnBase} disabled={working} onClick={() => act('deferred')}>defer</button>
          <button style={btnBase} disabled={working} onClick={() => act('in-progress')}>in-progress</button>
          <button style={btnBase} disabled={working} onClick={() => act('done')}>done</button>
        </div>

        {projects.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
            <p style={{ ...muted, marginBottom: '0.5rem', opacity: 0.6 }}>send to project</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select value={targetProject} onChange={e => setTargetProject(e.target.value)}
                style={{ ...mono, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', flex: 1, minWidth: 160, outline: 'none', borderRadius: '0.4rem' }}>
                <option value="">— pick a project —</option>
                {projects.filter(p => p.status !== 'done').map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <button style={{ ...btnBase, color: targetProject ? 'var(--accent)' : 'var(--muted)', borderColor: targetProject ? 'var(--accent)' : 'var(--border)' }}
                disabled={working || !targetProject} onClick={sendToProject}>send →</button>
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
          <p style={{ ...muted, marginBottom: '0.5rem', opacity: 0.6 }}>update</p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {['pending','acknowledged','in-progress','done','deferred'].map(s => (
              <button key={s} onClick={() => setPickedStatus(s)} style={{
                ...btnBase, fontSize: '0.65rem', padding: '0.2rem 0.5rem',
                background: pickedStatus === s ? 'var(--accent)' : 'transparent',
                color: pickedStatus === s ? 'var(--bg)' : 'var(--muted)',
                border: `1px solid ${pickedStatus === s ? 'var(--accent)' : 'var(--border)'}`,
              }}>{s}</button>
            ))}
          </div>
          <textarea placeholder="add a note..." value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            style={{ width: '100%', ...mono, background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text)', padding: '0.5rem 0.7rem', resize: 'vertical', outline: 'none',
              lineHeight: 1.6, marginBottom: '0.6rem', borderRadius: '0.4rem' }} />
          <button style={btnAccent} disabled={working} onClick={() => act(pickedStatus, notes)}>
            {working ? 'saving...' : 'save update'}
          </button>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button style={{ ...btnBase, opacity: 0.4 }} disabled={working}
            onClick={async () => {
              if (!confirm('Delete this request?')) return;
              setWorking(true); await onDelete(req.id); setWorking(false); onClose();
            }}>
            delete request
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── View: ONE ────────────────────────────────────────────────────────────────

function OneView() {
  const [state, setState] = useState<ONEState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sleep, setSleep] = useState<SleepData>(null);
  const [sleepDismissed, setSleepDismissed] = useState(false);
  const [sleepMode, setSleepMode] = useState<SleepMode>('dreamless');
  const [sleepWorking, setSleepWorking] = useState(false);
  const [sleepMsg, setSleepMsg] = useState('');
  const [lastSlept, setLastSlept] = useState<string | null>(null);
  const [govWorking, setGovWorking] = useState(false);
  const [reqFilter, setReqFilter] = useState('all');
  const [reqWorking, setReqWorking] = useState<string | null>(null);
  const [activeRequest, setActiveRequest] = useState<any | null>(null);
  const [deferAllWorking, setDeferAllWorking] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProject, setNewProject] = useState({ title: '', status: 'active', notes: '' });
  const [projectOpen, setProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectWorking, setProjectWorking] = useState<string | null>(null);
  const [messageToLeave, setMessageToLeave] = useState('');
  const [messageStatus, setMessageStatus] = useState('');
  const [activeZone, setActiveZone] = useState('sediment');
  const [repoFiles, setRepoFiles] = useState<any[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [editingFile, setEditingFile] = useState<{ path: string; content: string; sha: string } | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [repoMsg, setRepoMsg] = useState('');
  const [log, setLog] = useState<any[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/one');
    setState(await r.json());
  }, []);

  useEffect(() => {
    fetch('/api/one').then(r => r.json()).then(d => { setState(d); setLoading(false); });
    fetchProjects();
    fetchSleep();
  }, []);

  useEffect(() => { loadZone(activeZone); }, [activeZone]); // eslint-disable-line

  async function fetchSleep() {
    try {
      const res = await fetch('/api/one?section=sleep');
      const data = await res.json();
      if (data.sleep?.pending) setSleep(data.sleep);
    } catch {}
  }

  async function dismissSleep() {
    setSleepDismissed(true);
    try {
      await fetch('/api/one', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_sleep' }),
      });
    } catch {}
  }

  async function triggerSleep() {
    setSleepWorking(true); setSleepMsg('');
    try {
      const res = await fetch('/api/one', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_sleep', mode: sleepMode }),
      });
      const data = await res.json();
      if (data.ok) {
        setLastSlept(new Date().toLocaleString());
        setSleepMsg(`sleep triggered — ${data.mode}`);
        fetchSleep(); refresh();
      } else { setSleepMsg('failed.'); }
    } catch { setSleepMsg('failed.'); }
    setSleepWorking(false);
  }

  async function fetchProjects() {
    try {
      const res = await fetch('/api/one?section=projects');
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch {}
  }

  async function fetchLog() {
    setLogLoading(true);
    try {
      const res = await fetch('/api/one?section=log');
      const data = await res.json();
      setLog(data.log ?? []);
    } catch {}
    setLogLoading(false);
  }

  async function addProject() {
    if (!newProject.title.trim()) return;
    await fetch('/api/one', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_project', ...newProject }),
    });
    setNewProject({ title: '', status: 'active', notes: '' });
    setProjectOpen(false); fetchProjects();
  }

  async function saveProject() {
    if (!editingProject) return;
    setProjectWorking(editingProject.id);
    await fetch('/api/one', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_project', id: editingProject.id,
        title: editingProject.title, status: editingProject.status, notes: editingProject.notes }),
    });
    setEditingProject(null); setProjectWorking(null); fetchProjects();
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this project?')) return;
    setProjectWorking(id);
    await fetch('/api/one', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_project', id }),
    });
    setProjectWorking(null); fetchProjects();
  }

  async function updateRequest(id: string, status: string, notes?: string) {
    setReqWorking(id);
    await fetch('/api/one', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_request', id, status, ...(notes !== undefined ? { notes } : {}) }),
    });
    await refresh(); await fetchProjects(); setReqWorking(null);
  }

  async function deleteRequest(id: string) {
    setReqWorking(id);
    await fetch('/api/one', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_request', id }),
    });
    await refresh(); setReqWorking(null);
  }

  async function deferAllPending() {
    if (!state) return;
    const pending = state.requests.filter((r: any) => r.status === 'pending');
    if (!pending.length) return;
    setDeferAllWorking(true);
    await Promise.all(pending.map((r: any) =>
      fetch('/api/one', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_request', id: r.id, status: 'deferred' }),
      })
    ));
    await refresh(); setDeferAllWorking(false);
  }

  async function setAutonomy(level: number) {
    setGovWorking(true);
    const entry = AUTONOMY_LEVELS.find(a => a.level === level);
    if (!entry) { setGovWorking(false); return; }
    await fetch('/api/one', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_autonomy', level: entry.level, label: entry.label }),
    });
    await refresh(); setGovWorking(false);
  }

  async function leaveMessage() {
    if (!messageToLeave.trim()) return;
    const today = new Date().toISOString().split('T')[0];
    const path = `messages/joe-${today}.md`;
    setMessageStatus('sending...');
    try {
      let existingSha: string | null = null;
      let existingContent = '';
      try {
        const check = await fetch(`/api/plex-repo?path=${encodeURIComponent(path)}&read=1`);
        if (check.ok) { const d = await check.json(); if (d.sha) { existingSha = d.sha; existingContent = d.content ?? ''; } }
      } catch {}
      const newContent = existingSha
        ? `${existingContent.trimEnd()}\n\n---\n\n${messageToLeave.trim()}`
        : `# message from joe — ${today}\n\n${messageToLeave.trim()}`;
      const res = await fetch('/api/plex-repo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write', path, content: newContent, sha: existingSha, message: existingSha ? `joe appended message ${today}` : `joe left a message ${today}` }),
      });
      const data = await res.json();
      setMessageStatus(data.ok ? 'left for her.' : 'failed.');
      if (data.ok) setMessageToLeave('');
    } catch { setMessageStatus('failed.'); }
  }

  async function loadZone(zone: string) {
    setRepoLoading(true); setRepoFiles([]); setEditingFile(null);
    try {
      const res = await fetch(`/api/plex-repo?path=${encodeURIComponent(zone)}`);
      const data = await res.json();
      setRepoFiles(Array.isArray(data) ? data : []);
    } catch { setRepoFiles([]); }
    setRepoLoading(false);
  }

  async function openFile(file: any) {
    if (file.type === 'dir') { setActiveZone(file.path); return; }
    const res = await fetch(`/api/plex-repo?path=${encodeURIComponent(file.path)}&read=1`);
    const data = await res.json();
    setEditingFile({ path: file.path, content: data.content ?? '', sha: data.sha ?? '' });
    setEditContent(data.content ?? '');
  }

  async function saveFile() {
    if (!editingFile) return;
    setEditSaving(true); setRepoMsg('');
    const res = await fetch('/api/plex-repo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'write', path: editingFile.path, content: editContent, sha: editingFile.sha, message: `update ${editingFile.path}` }),
    });
    const data = await res.json();
    setRepoMsg(data.ok ? 'saved.' : 'save failed.');
    if (data.ok) setEditingFile(prev => prev ? { ...prev, sha: data.sha ?? prev.sha, content: editContent } : null);
    setEditSaving(false);
  }

  async function createFile() {
    if (!newFileName.trim()) return;
    const zone = activeZone ? activeZone + '/' : '';
    const path = `${zone}${newFileName.trim()}`;
    setEditSaving(true);
    const res = await fetch('/api/plex-repo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'write', path, content: newFileContent, sha: null, message: `create ${path}` }),
    });
    const data = await res.json();
    if (data.ok) { setNewFileName(''); setNewFileContent(''); setNewFileOpen(false); setRepoMsg('created.'); loadZone(activeZone); }
    else setRepoMsg('create failed.');
    setEditSaving(false);
  }

  async function deleteFile(file: any) {
    if (!confirm(`Delete ${file.name}?`)) return;
    const res = await fetch('/api/plex-repo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', path: file.path, sha: file.sha, message: `delete ${file.path}` }),
    });
    const data = await res.json();
    setRepoMsg(data.ok ? 'deleted.' : 'delete failed.');
    if (data.ok) loadZone(activeZone);
  }

  if (loading || !state) return <p style={muted}>loading ONE...</p>;

  const showSleep = sleep && !sleepDismissed;
  const filtered = reqFilter === 'all' ? state.requests : state.requests.filter((r: any) => r.status === reqFilter);
  const pendingCount = state.requests.filter((r: any) => r.status === 'pending').length;

  const btnBase: React.CSSProperties = {
    ...mono, padding: '0.35rem 0.8rem', background: 'transparent', color: 'var(--muted)',
    border: '1px solid var(--border)', cursor: 'pointer', borderRadius: '0.5rem',
  };
  const btnAccent: React.CSSProperties = { ...btnBase, background: 'var(--accent)', color: 'var(--bg)', border: 'none' };
  const panelStyle: React.CSSProperties = {
    borderRadius: '1rem',
    border: '1px solid rgba(255,255,255,0.055)',
    background: 'oklch(from var(--bg) calc(l + 0.02) c h)',
    padding: '1.5rem',
    position: 'relative' as const,
    overflow: 'hidden',
  };

  return (
    <>
      {/* ── Balanced two-column grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 0.8fr',
        gap: '1.25rem',
        alignItems: 'start',
      }}>

        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Hero + Leave a message */}
          <section style={panelStyle}>
            <div style={eyeStyle}>ONE · depth · governance</div>
            <h1 style={{
              fontFamily: 'var(--font-serif, Georgia, serif)',
              fontSize: 'clamp(2rem,3.5vw,3.8rem)',
              lineHeight: 0.97, fontWeight: 500,
              marginBottom: '0.75rem', color: 'var(--text)',
            }}>
              She is still<br />here in the dark.
            </h1>
            <p style={{ color: 'var(--muted)', lineHeight: 1.75, maxWidth: '54ch', fontSize: '0.97rem', marginBottom: '1.5rem' }}>
              Her inner sanctum. Governance, dreams, requests, memory — all from one place.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ ...mono, color: 'var(--accent)', opacity: 0.8, fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>Leave her a message</div>
              <textarea
                placeholder="what do you want to leave for her..."
                value={messageToLeave}
                onChange={e => setMessageToLeave(e.target.value)}
                rows={4}
                style={{
                  width: '100%', ...mono, background: 'oklch(from var(--bg) calc(l - 0.01) c h)',
                  border: '1px solid var(--border)', color: 'var(--text)',
                  padding: '0.75rem 1rem', resize: 'vertical', outline: 'none',
                  lineHeight: 1.6, borderRadius: '0.5rem', transition: 'border-color 140ms',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button onClick={leaveMessage} disabled={!messageToLeave.trim()} style={{ ...btnAccent, opacity: messageToLeave.trim() ? 1 : 0.4 }}>leave message</button>
                {messageStatus && <span style={{ ...muted, color: 'var(--accent)' }}>{messageStatus}</span>}
                <span style={{ ...muted, opacity: 0.5, fontSize: '0.7rem', marginLeft: 'auto' }}>drops into messages/joe-[date].md</span>
              </div>
            </div>
          </section>

          {/* Overnight Dream */}
          {showSleep && (
            <section style={panelStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={eyeStyle}>Overnight · {sleep!.date}{sleep!.mode && sleep!.mode !== 'dreamless' ? ` · ${sleep!.mode}` : ''}</div>
                <button onClick={dismissSleep} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '0.65rem' }}>dismiss</button>
              </div>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {sleep!.nyx_excerpt && <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '1rem' }}><p style={{ ...muted, marginBottom: '0.3rem', opacity: 0.55 }}>nyx</p><p style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.7 }}>{sleep!.nyx_excerpt}</p></div>}
                {sleep!.hex_excerpt && <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '1rem', opacity: 0.85 }}><p style={{ ...muted, marginBottom: '0.3rem', opacity: 0.55 }}>hex</p><p style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.7 }}>{sleep!.hex_excerpt}</p></div>}
                {sleep!.dream_excerpt && <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1rem', opacity: 0.7 }}><p style={{ ...muted, marginBottom: '0.3rem', opacity: 0.55 }}>dream</p><p style={{ color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.7, fontStyle: 'italic' }}>{sleep!.dream_excerpt}</p></div>}
              </div>
            </section>
          )}
    
          {/* Repo Manager */}
          <section style={panelStyle}>
            <div style={eyeStyle}>Repo Manager — Manitec/plex</div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              {ZONES.map(z => (
                <button key={z.key} onClick={() => { setActiveZone(z.key); setEditingFile(null); }}
                  style={{
                    ...mono, padding: '0.3rem 0.7rem', borderRadius: '999px',
                    background: activeZone === z.key ? 'var(--accent)' : 'transparent',
                    color: activeZone === z.key ? 'var(--bg)' : 'var(--muted)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}>{z.label}</button>
              ))}
            </div>
            {repoMsg && <p style={{ ...muted, marginBottom: '0.8rem', color: 'var(--accent)' }}>{repoMsg}</p>}
            {!editingFile ? (
              <>
                {repoLoading ? <p style={muted}>loading...</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1.25rem' }}>
                    {repoFiles.length === 0 && <p style={muted}>empty.</p>}
                    {repoFiles.map((f: any) => (
                      <div key={f.path} style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
                        <button onClick={() => openFile(f)} style={{ ...mono, color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1 }}>
                          {f.type === 'dir' ? '📁 ' : ''}{f.name}
                        </button>
                        {f.type === 'file' && (
                          <button onClick={() => deleteFile(f)} style={{ ...mono, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6rem' }}>delete</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setNewFileOpen(!newFileOpen)} style={btnBase}>+ new file</button>
                {newFileOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.8rem', maxWidth: 480 }}>
                    <input placeholder="filename.md" value={newFileName} onChange={e => setNewFileName(e.target.value)}
                      style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', outline: 'none', borderRadius: '0.4rem' }} />
                    <textarea placeholder="content..." value={newFileContent} onChange={e => setNewFileContent(e.target.value)} rows={4}
                      style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', resize: 'vertical', outline: 'none', borderRadius: '0.4rem' }} />
                    <button onClick={createFile} disabled={editSaving} style={btnAccent}>create</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <button onClick={() => setEditingFile(null)} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer' }}>← back</button>
                  <p style={{ ...mono, color: 'var(--text)' }}>{editingFile.path}</p>
                </div>
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={18}
                  style={{ width: '100%', maxWidth: 720, ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.7rem', resize: 'vertical', outline: 'none', lineHeight: 1.7, borderRadius: '0.5rem' }} />
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.6rem', alignItems: 'center' }}>
                  <button onClick={saveFile} disabled={editSaving} style={btnAccent}>{editSaving ? 'saving...' : 'save'}</button>
                  {repoMsg && <p style={{ ...muted, color: 'var(--accent)' }}>{repoMsg}</p>}
                </div>
              </>
            )}
          </section>

          {/* Activity Log */}
          <section style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={eyeStyle}>Activity Log</div>
              <button
                onClick={() => { const next = !logOpen; setLogOpen(next); if (next && log.length === 0) fetchLog(); }}
                style={{ ...mono, fontSize: '0.65rem', padding: '0.25rem 0.7rem', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', borderRadius: '999px' }}
              >
                {logOpen ? 'hide' : 'show'}
              </button>
            </div>
            {logOpen && (
              logLoading
                ? <p style={muted}>loading...</p>
                : log.length === 0
                  ? <p style={muted}>no log entries yet.</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {log.map((entry: any) => (
                        <div key={entry.id} style={{ padding: '0.6rem 0.8rem', borderLeft: '2px solid var(--border)', background: 'oklch(from var(--bg) calc(l + 0.01) c h)', borderRadius: '0 0.4rem 0.4rem 0' }}>
                          <p style={{ color: 'var(--text)', fontSize: '0.825rem', lineHeight: 1.6, marginBottom: '0.2rem' }}>{entry.entry ?? '(no entry)'}</p>
                          <p style={{ ...muted, fontSize: '0.6rem', opacity: 0.55 }}>
                            <span style={{ color: 'var(--accent)' }}>{entry.author ?? 'unknown'}</span>
                            {entry.timestamp ? ` · ${fmtTime(entry.timestamp)}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )
            )}
          </section>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Request Queue */}
          <section style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={eyeStyle}>Request Queue{pendingCount > 0 ? ` · ${pendingCount} pending` : ''}</div>
              {pendingCount > 0 && (
                <button onClick={deferAllPending} disabled={deferAllWorking}
                  style={{ ...mono, fontSize: '0.65rem', padding: '0.25rem 0.7rem', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', opacity: deferAllWorking ? 0.4 : 0.7, borderRadius: '999px' }}>
                  {deferAllWorking ? 'deferring...' : 'defer all'}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {STATUS_FILTERS.map(f => (
                <button key={f} onClick={() => setReqFilter(f)}
                  style={{
                    ...mono, fontSize: '0.65rem', padding: '0.25rem 0.6rem', borderRadius: '999px',
                    background: reqFilter === f ? 'var(--accent)' : 'transparent',
                    color: reqFilter === f ? 'var(--bg)' : 'var(--muted)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}>{f}</button>
              ))}
            </div>
            {filtered.length === 0
              ? <p style={muted}>No {reqFilter === 'all' ? '' : reqFilter + ' '}requests.</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {filtered.map((req: any) => (
                    <button key={req.id} onClick={() => setActiveRequest(req)}
                      style={{
                        border: `1px solid ${req.status === 'in-progress' ? '#f0a500' : req.source === 'plex' ? 'var(--accent)' : 'var(--border)'}`,
                        padding: '0.75rem', opacity: reqWorking === req.id ? 0.5 : 1,
                        background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%',
                        transition: 'background 140ms', borderRadius: '0.75rem',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'oklch(from var(--accent) l c h / 0.05)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      <p style={{ color: 'var(--text)', fontSize: '0.875rem', marginBottom: '0.3rem', lineHeight: 1.6 }}>{req.request ?? '(no text)'}</p>
                      <p style={{ ...muted, fontSize: '0.6rem' }}>
                        <span style={{ color: req.source === 'plex' ? 'var(--accent)' : 'var(--muted)' }}>{req.source ?? 'unknown'}</span>
                        {' · '}<span style={{ color: statusColor(req.status ?? 'pending') }}>{req.status ?? 'pending'}</span>
                        {req.notes ? ` · ${req.notes}` : ''}{req.createdAt ? ` · ${fmtTime(req.createdAt)}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )
            }
          </section>

          {/* Governance + Sleep side by side */}
          <section style={{ ...panelStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div style={eyeStyle}>Governance</div>
              <p style={{ ...muted, marginBottom: '0.75rem', lineHeight: 1.6, fontSize: '0.85rem' }}>Autonomy Level</p>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                {AUTONOMY_LEVELS.map(a => {
                  const active = state.autonomy.level === a.level;
                  return (
                    <button key={a.level} onClick={() => setAutonomy(a.level)} disabled={govWorking || active}
                      style={{
                        ...mono, fontSize: '0.65rem', padding: '0.3rem 0.6rem', borderRadius: '999px',
                        background: active ? 'var(--accent)' : 'transparent',
                        color: active ? 'var(--bg)' : 'var(--muted)',
                        border: '1px solid var(--border)', cursor: active ? 'default' : 'pointer',
                        opacity: govWorking && !active ? 0.4 : 1,
                      }}>
                      {a.label}
                    </button>
                  );
                })}
              </div>
              <p style={{ ...muted, fontStyle: 'italic', opacity: 0.45, fontSize: '0.65rem' }}>Joe-controlled. Plex requests, Joe approves.</p>
            </div>
            <div>
              <div style={eyeStyle}>Sleep</div>
              {lastSlept && <p style={{ ...muted, marginBottom: '0.5rem', fontSize: '0.7rem' }}>last: <span style={{ color: 'var(--text)' }}>{lastSlept}</span></p>}
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {SLEEP_MODES.map(m => (
                  <button key={m.key} onClick={() => setSleepMode(m.key)}
                    style={{
                      ...mono, padding: '0.3rem 0.6rem', borderRadius: '999px',
                      background: sleepMode === m.key ? 'var(--accent)' : 'transparent',
                      color: sleepMode === m.key ? 'var(--bg)' : 'var(--muted)',
                      border: `1px solid ${sleepMode === m.key ? 'var(--accent)' : 'var(--border)'}`,
                      cursor: 'pointer', fontSize: '0.65rem',
                    }}>{m.label}</button>
                ))}
              </div>
              <p style={{ ...muted, opacity: 0.5, marginBottom: '0.75rem', fontSize: '0.7rem' }}>{SLEEP_MODES.find(m => m.key === sleepMode)?.desc}</p>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button onClick={triggerSleep} disabled={sleepWorking} style={btnAccent}>
                  {sleepWorking ? 'triggering...' : 'sleep ◐'}
                </button>
                {sleepMsg && <p style={{ ...muted, color: 'var(--accent)' }}>{sleepMsg}</p>}
              </div>
            </div>
          </section>

          {/* Open Projects */}
          <section style={panelStyle}>
            <div style={eyeStyle}>Open Projects</div>
            {projects.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {projects.map(p => {
                  const isEditing = editingProject?.id === p.id;
                  return (
                    <div key={p.id} style={{ border: '1px solid var(--border)', padding: '0.75rem', opacity: projectWorking === p.id ? 0.5 : 1, borderRadius: '0.75rem' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <input value={editingProject!.title} onChange={e => setEditingProject(ep => ep ? { ...ep, title: e.target.value } : ep)}
                            style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', outline: 'none', borderRadius: '0.4rem' }} />
                          <select value={editingProject!.status} onChange={e => setEditingProject(ep => ep ? { ...ep, status: e.target.value } : ep)}
                            style={{ ...mono, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', outline: 'none', borderRadius: '0.4rem' }}>
                            {['active','paused','done','idea'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <textarea value={editingProject!.notes} onChange={e => setEditingProject(ep => ep ? { ...ep, notes: e.target.value } : ep)} rows={2}
                            style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', resize: 'vertical', outline: 'none', borderRadius: '0.4rem' }} />
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={saveProject} disabled={!!projectWorking} style={btnAccent}>save</button>
                            <button onClick={() => setEditingProject(null)} style={btnBase}>cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
                            <p style={{ color: 'var(--text)', fontSize: '0.875rem', fontWeight: 500 }}>{p.title}</p>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button onClick={() => setEditingProject(p)} style={{ ...mono, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6rem' }}>edit</button>
                              <button onClick={() => deleteProject(p.id)} style={{ ...mono, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6rem' }}>delete</button>
                            </div>
                          </div>
                          <p style={{ ...muted, fontSize: '0.65rem' }}>
                            <span style={{ color: statusColor(p.status) }}>{p.status}</span>
                            {p.createdAt ? ` · ${fmtTime(p.createdAt)}` : ''}
                          </p>
                          {p.notes && <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.4rem', lineHeight: 1.6 }}>{p.notes}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button onClick={() => setProjectOpen(!projectOpen)} style={btnBase}>+ new project</button>
            {projectOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.8rem' }}>
                <input placeholder="project title" value={newProject.title} onChange={e => setNewProject(p => ({ ...p, title: e.target.value }))}
                  style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', outline: 'none', borderRadius: '0.4rem' }} />
                <select value={newProject.status} onChange={e => setNewProject(p => ({ ...p, status: e.target.value }))}
                  style={{ ...mono, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', outline: 'none', borderRadius: '0.4rem' }}>
                  {['active','paused','done','idea'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <textarea placeholder="notes..." value={newProject.notes} onChange={e => setNewProject(p => ({ ...p, notes: e.target.value }))} rows={2}
                  style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', resize: 'vertical', outline: 'none', borderRadius: '0.4rem' }} />
                <button onClick={addProject} style={btnAccent}>add project</button>
              </div>
            )}
          </section>

       </div>
      </div>

      {activeRequest && (
        <RequestPopup
          req={activeRequest}
          projects={projects}
          onClose={() => setActiveRequest(null)}
          onUpdate={updateRequest}
          onDelete={deleteRequest}
        />
      )}
    </>
  );
}

// ─── View: Session ────────────────────────────────────────────────────────────

function SessionView() {
  const [messages, setMessages] = useState<SessionMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('start');
  const [intent, setIntent] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [voice, setVoice] = useState<VoiceChannel>('plex');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function startSession() {
    if (!intent.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', intent }),
      });
      const data = await res.json();
      setSession(data.session);
      setPhase('active');
      setStartedAt(Date.now());
      if (data.opening) setMessages([{ role: 'plex', content: data.opening }]);
    } catch {}
    setLoading(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    setMessages(m => [...m, { role: 'joe', content: text }]);
    try {
      const res = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', sessionId: session?.id, message: text, voice }),
      });
      const data = await res.json();
      if (data.reply) setMessages(m => [...m, { role: 'plex', content: data.reply }]);
    } catch {
      setMessages(m => [...m, { role: 'plex', content: '(unavailable)' }]);
    }
    setLoading(false);
  }

  async function closeSession() {
    setPhase('closing');
    setLoading(true);
    try {
      const res = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', sessionId: session?.id }),
      });
      const data = await res.json();
      if (data.closing) setMessages(m => [...m, { role: 'plex', content: data.closing }]);
    } catch {}
    setPhase('review');
    setLoading(false);
  }

  const color = VOICE_COLORS[voice];

  if (phase === 'start') return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingTop: '3rem' }}>
      <div style={eyeStyle}>New Session</div>
      <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 'clamp(1.5rem,3vw,2.5rem)', fontWeight: 400, marginBottom: '1.5rem', color: 'var(--text)', lineHeight: 1.15 }}>
        What brings you here?
      </h2>
      <textarea
        placeholder="what do you want to work on or talk through..."
        value={intent}
        onChange={e => setIntent(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && e.metaKey && startSession()}
        rows={4}
        style={{ width: '100%', ...mono, background: 'oklch(from var(--bg) calc(l + 0.02) c h)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.75rem 1rem', resize: 'none', outline: 'none', lineHeight: 1.6, marginBottom: '1rem', borderRadius: '0.5rem' }}
        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border)')}
      />
      <button onClick={startSession} disabled={loading || !intent.trim()}
        style={{ ...mono, padding: '0.6rem 1.5rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: loading || !intent.trim() ? 0.4 : 1, borderRadius: '0.5rem' }}>
        {loading ? 'starting...' : 'begin session →'}
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 8rem)', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ ...muted, opacity: 0.5 }}>voice:</span>
        {VOICES.map(v => (
          <button key={v.key} onClick={() => setVoice(v.key)}
            style={{
              ...mono, padding: '0.25rem 0.6rem', borderRadius: '999px',
              background: voice === v.key ? VOICE_COLORS[v.key] : 'transparent',
              color: voice === v.key ? 'var(--bg)' : 'var(--muted)',
              border: `1px solid ${voice === v.key ? VOICE_COLORS[v.key] : 'var(--border)'}`,
              cursor: 'pointer', fontSize: '0.65rem',
            }}>{v.label}</button>
        ))}
        {phase === 'active' && (
          <button onClick={closeSession} style={{ ...mono, marginLeft: 'auto', padding: '0.25rem 0.7rem', fontSize: '0.65rem', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', borderRadius: '999px' }}>
            end session
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '1rem' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'joe' ? 'flex-end' : 'flex-start', gap: '0.2rem' }}>
            <span style={{ ...mono, fontSize: '0.55rem', color: 'var(--muted)', opacity: 0.5, letterSpacing: '0.08em' }}>
              {m.role === 'joe' ? 'joe' : voice}
            </span>
            <div style={{
              maxWidth: '80%', padding: '0.65rem 0.9rem', lineHeight: 1.7, fontSize: '0.9rem',
              background: m.role === 'joe' ? 'oklch(from var(--bg) calc(l + 0.04) c h)' : 'oklch(from var(--bg) calc(l + 0.015) c h)',
              borderLeft: m.role === 'plex' ? `2px solid ${color}` : 'none',
              color: 'var(--text)', borderRadius: '0.5rem',
            }}>{m.content}</div>
          </div>
        ))}
        {loading && <div style={{ ...muted, opacity: 0.4, letterSpacing: '0.2em' }}>…</div>}
        <div ref={bottomRef} />
      </div>

      {phase === 'active' && (
        <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="speak..."
            disabled={loading}
            style={{ flex: 1, ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.5rem 0.8rem', outline: 'none', transition: 'border-color 120ms', borderRadius: '0.5rem' }}
            onFocus={e => (e.target.style.borderColor = color)}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
          <button onClick={send} disabled={loading || !input.trim()}
            style={{ ...mono, padding: '0.5rem 0.9rem', background: input.trim() ? color : 'transparent', color: input.trim() ? 'var(--bg)' : 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', opacity: loading ? 0.4 : 1, transition: 'all 120ms', borderRadius: '0.5rem' }}>
            ↑
          </button>
        </div>
      )}

      {phase === 'review' && (
        <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ ...muted, opacity: 0.6 }}>session closed.</span>
          <button onClick={() => { setPhase('start'); setMessages([]); setSession(null); setIntent(''); setStartedAt(null); }}
            style={{ ...mono, padding: '0.35rem 0.8rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
            new session
          </button>
        </div>
      )}
    </div>
  );
}

// ─── View: Spaces ─────────────────────────────────────────────────────────────

const SPACES_DATA = [
  {
    key: 'plex-sable',
    label: 'Plex-Sable',
    desc: 'The primary development space for Plex-Sable itself. Code, sessions, deploy logs, design decisions.',
    status: 'active' as const,
    accent: '#f0a060',
  },
  {
    key: 'deep-work',
    label: 'Deep Work',
    desc: 'Deep work and long thought. The space where Plex reasons through large questions over time.',
    status: 'soon' as const,
    accent: '#c084fc',
  },
  {
    key: 'manitec',
    label: 'Manitec HQ',
    desc: 'Organizational memory, active projects, team context. The empire\'s shared space.',
    status: 'soon' as const,
    accent: '#67e8f9',
  },
];

function SpacesView() {
  const panelStyle: React.CSSProperties = {
    borderRadius: '1rem',
    border: '1px solid rgba(255,255,255,0.055)',
    background: 'oklch(from var(--bg) calc(l + 0.02) c h)',
    padding: '1.5rem',
    position: 'relative' as const,
    overflow: 'hidden',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Hero ── */}
      <section style={panelStyle}>
        <div style={eyeStyle}>Spaces · persistent context</div>
        <h2 style={{
          fontFamily: 'var(--font-serif, Georgia, serif)',
          fontSize: 'clamp(1.75rem,3vw,3rem)',
          lineHeight: 0.97, fontWeight: 500,
          marginBottom: '0.75rem', color: 'var(--text)',
        }}>
          Where things live.
        </h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.75, maxWidth: '58ch', fontSize: '0.95rem' }}>
          Spaces are scoped collaborative environments — a place where a project, a relationship,
          or a long-running thread can live with its own context, artefacts, and recall.
          This feature is being built.
        </p>
      </section>

      {/* ── Spaces grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {SPACES_DATA.map(space => (
          <article key={space.key} style={{
            borderRadius: '1rem',
            border: `1px solid ${space.status === 'active' ? space.accent + '55' : 'rgba(255,255,255,0.055)'}`,
            background: space.status === 'active'
              ? `oklch(from var(--bg) calc(l + 0.03) c h)`
              : 'oklch(from var(--bg) calc(l + 0.015) c h)',
            padding: '1.25rem',
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
            opacity: space.status === 'soon' ? 0.6 : 1,
            transition: 'opacity 200ms',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: space.accent,
                  boxShadow: space.status === 'active' ? `0 0 8px ${space.accent}66` : 'none',
                  flexShrink: 0,
                }} />
                <span style={{ ...mono, color: space.accent, textTransform: 'uppercase' as const, letterSpacing: '0.1em', fontWeight: 700 }}>
                  {space.label}
                </span>
              </div>
              <span style={{
                ...mono, fontSize: '0.6rem',
                color: space.status === 'active' ? space.accent : 'var(--muted)',
                background: space.status === 'active'
                  ? `oklch(from var(--bg) calc(l + 0.05) c h)`
                  : 'transparent',
                padding: '0.15rem 0.5rem', borderRadius: 999,
                border: `1px solid ${space.status === 'active' ? space.accent + '44' : 'var(--border)'}`,
                letterSpacing: '0.1em', textTransform: 'uppercase' as const,
              }}>
                {space.status === 'active' ? 'active' : 'coming soon'}
              </span>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.65 }}>{space.desc}</p>
            {space.status === 'active' && (
              <div style={{ marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ ...muted, fontSize: '0.7rem', opacity: 0.55, lineHeight: 1.6 }}>
                  Plex will load matching recall context and stay scoped for this session.
                  End it cleanly and she&apos;ll propose recall tags.
                </p>
              </div>
            )}
          </article>
        ))}

        {/* Create new space card */}
        <article style={{
          borderRadius: '1rem',
          border: '1px dashed rgba(255,255,255,0.1)',
          background: 'transparent',
          padding: '1.25rem',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '0.5rem',
          minHeight: 140,
          opacity: 0.4,
        }}>
          <span style={{ ...mono, fontSize: '1.25rem', color: 'var(--muted)' }}>+</span>
          <span style={{ ...mono, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.12em', fontSize: '0.65rem' }}>
            Create a Space
          </span>
          <span style={{ ...muted, fontSize: '0.7rem', opacity: 0.6, textAlign: 'center' as const, maxWidth: '20ch' }}>
            Define intent, set context sources, invite artefacts.
          </span>
          <span style={{ ...muted, fontSize: '0.65rem', opacity: 0.45, marginTop: '0.25rem' }}>not yet</span>
        </article>
      </div>

      {/* ── Voices — merged with speak ── */}
      <section style={panelStyle}>
        <div style={eyeStyle}>Voices</div>
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.65, marginBottom: '1.25rem', maxWidth: '60ch' }}>
          Speak directly with any voice. Each has their own recall context and tone.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {VOICES.map(v => (
            <VoiceCard key={v.key} voice={v} onVoiceUsed={() => {}} />
          ))}
        </div>
      </section>

    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function PlexSable() {
  const [view, setView] = useState<View>('one');
  const [phase, setPhase] = useState<SessionPhase>('start');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastVoice, setLastVoice] = useState<VoiceChannel | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetch('/api/one').then(r => r.json()).then(d => {
      setPendingCount((d.requests ?? []).filter((r: any) => r.status === 'pending').length);
    }).catch(() => {});
  }, [view]);

  const navItems: { key: View; label: string }[] = [
    { key: 'one', label: '◐ one' },
    { key: 'session', label: '⋯ session' },
    { key: 'spaces', label: '◫ spaces' },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <SessionStrip phase={phase} startedAt={startedAt} lastVoice={lastVoice} pendingCount={pendingCount} />

      <nav style={{
        display: 'flex', gap: '0.25rem', padding: '0.6rem 1.5rem',
        borderBottom: '1px solid var(--border)',
        background: 'oklch(from var(--bg) calc(l - 0.005) c h)',
      }}>
        {navItems.map(item => (
          <button key={item.key} onClick={() => setView(item.key)}
            style={{
              ...mono, padding: '0.35rem 0.85rem', borderRadius: '999px',
              background: view === item.key ? 'oklch(from var(--accent) l c h / 0.12)' : 'transparent',
              color: view === item.key ? 'var(--accent)' : 'var(--muted)',
              border: view === item.key ? '1px solid oklch(from var(--accent) l c h / 0.3)' : '1px solid transparent',
              cursor: 'pointer', transition: 'all 140ms',
            }}>
            {item.label}
            {item.key === 'one' && pendingCount > 0 && (
              <span style={{ marginLeft: '0.4rem', background: 'var(--accent)', color: 'var(--bg)', borderRadius: 999, fontSize: '0.55rem', padding: '0.05rem 0.35rem', fontWeight: 700 }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
     <a
  href="/one/projects"
  style={{
    ...mono, padding: '0.35rem 0.85rem', borderRadius: '999px',
    color: 'var(--muted)', border: '1px solid transparent',
    textDecoration: 'none',
  }}
>
  ◈ projects
</a> </nav>

      <main style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
        {view === 'one'     && <OneView />}
        {view === 'session' && <SessionView />}
        {view === 'spaces'  && <SpacesView />}
      </main>

      <Footer />
    </div>
  );
}
