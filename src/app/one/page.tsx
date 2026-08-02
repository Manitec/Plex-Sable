// src/app/one/page.tsx
// ONE Shell — sidebar layout
// Views: ◐ one | ⋯ session | ◫ spaces
// Nav removed. Footer kept. Session strip live across all views.
// Visual update Aug 2 2026 — balanced two-column ONE layout, spaces scaffold
// Spaces update Aug 2 2026 — full preview layout, voices+speak merged
// Aug 2 2026 — Voices section removed from ONE view (lives in Spaces only)
// Aug 2 2026 — spaces tab label restored (was incorrectly set to "voices")

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
                  {repoMsg && <span style={{ ...muted, color: 'var(--accent)' }}>{repoMsg}</span>}
                </div>
              </>
            )}
          </section>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Autonomy */}
          <section style={panelStyle}>
            <div style={eyeStyle}>Autonomy</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {AUTONOMY_LEVELS.map(a => (
                <button
                  key={a.level}
                  onClick={() => setAutonomy(a.level)}
                  disabled={govWorking}
                  style={{
                    ...mono, padding: '0.45rem 0.75rem', textAlign: 'left',
                    background: state.autonomy?.level === a.level
                      ? 'oklch(from var(--accent) l c h / 0.15)'
                      : 'transparent',
                    border: `1px solid ${
                      state.autonomy?.level === a.level ? 'var(--accent)' : 'var(--border)'
                    }`,
                    color: state.autonomy?.level === a.level ? 'var(--accent)' : 'var(--muted)',
                    cursor: 'pointer', borderRadius: '0.5rem', opacity: govWorking ? 0.5 : 1,
                    transition: 'all 140ms',
                  }}
                >
                  <span style={{ opacity: 0.45, marginRight: '0.5rem' }}>{a.level}</span>{a.label}
                </button>
              ))}
            </div>
            {state.autonomy?.updatedAt && (
              <p style={{ ...muted, opacity: 0.4, marginTop: '0.75rem', fontSize: '0.6rem' }}>updated {fmtTime(state.autonomy.updatedAt)}</p>
            )}
          </section>

          {/* Sleep */}
          <section style={panelStyle}>
            <div style={eyeStyle}>Sleep</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.85rem' }}>
              {SLEEP_MODES.map(m => (
                <button key={m.key} onClick={() => setSleepMode(m.key)} style={{
                  ...mono, padding: '0.45rem 0.75rem', textAlign: 'left',
                  background: sleepMode === m.key ? 'oklch(from var(--accent) l c h / 0.12)' : 'transparent',
                  border: `1px solid ${sleepMode === m.key ? 'var(--accent)' : 'var(--border)'}`,
                  color: sleepMode === m.key ? 'var(--accent)' : 'var(--muted)',
                  cursor: 'pointer', borderRadius: '0.5rem', transition: 'all 140ms',
                }}>
                  <span style={{ fontWeight: 700, marginRight: '0.5rem' }}>{m.label}</span>
                  <span style={{ opacity: 0.5, fontSize: '0.65rem' }}>{m.desc}</span>
                </button>
              ))}
            </div>
            <button onClick={triggerSleep} disabled={sleepWorking} style={{ ...btnAccent, opacity: sleepWorking ? 0.5 : 1 }}>
              {sleepWorking ? 'triggering…' : 'trigger sleep'}
            </button>
            {sleepMsg && <p style={{ ...muted, color: 'var(--accent)', marginTop: '0.5rem' }}>{sleepMsg}</p>}
            {lastSlept && <p style={{ ...muted, opacity: 0.4, marginTop: '0.4rem', fontSize: '0.6rem' }}>last: {lastSlept}</p>}
          </section>

          {/* Requests */}
          <section style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={eyeStyle}>Requests {pendingCount > 0 && <span style={{ marginLeft: '0.5rem', background: 'var(--accent)', color: 'var(--bg)', padding: '0.05rem 0.4rem', borderRadius: 999, fontSize: '0.55rem' }}>{pendingCount}</span>}</div>
              {pendingCount > 0 && (
                <button onClick={deferAllPending} disabled={deferAllWorking} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.45, fontSize: '0.6rem' }}>
                  defer all
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              {STATUS_FILTERS.map(f => (
                <button key={f} onClick={() => setReqFilter(f)} style={{
                  ...mono, padding: '0.2rem 0.5rem', fontSize: '0.6rem',
                  background: reqFilter === f ? 'var(--accent)' : 'transparent',
                  color: reqFilter === f ? 'var(--bg)' : 'var(--muted)',
                  border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 999,
                  opacity: reqFilter === f ? 1 : 0.5,
                }}>{f}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
              {filtered.length === 0 && <p style={{ ...muted, opacity: 0.4 }}>none.</p>}
              {filtered.map((r: any) => (
                <button key={r.id} onClick={() => setActiveRequest(r)}
                  disabled={reqWorking === r.id}
                  style={{
                    ...mono, textAlign: 'left', padding: '0.6rem 0.75rem',
                    background: 'oklch(from var(--bg) calc(l - 0.01) c h)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                    borderRadius: '0.5rem', width: '100%',
                    opacity: reqWorking === r.id ? 0.4 : 1,
                    transition: 'all 120ms',
                  }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ color: statusColor(r.status), fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{r.status}</span>
                    <span style={{ ...muted, opacity: 0.4, marginLeft: 'auto', fontSize: '0.55rem' }}>{fmtTime(r.createdAt)}</span>
                  </div>
                  <p style={{ color: 'var(--text)', fontSize: '0.8rem', lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.request ?? '(no text)'}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {/* Projects */}
          <section style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={eyeStyle}>Projects</div>
              <button onClick={() => setProjectOpen(!projectOpen)} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>+ new</button>
            </div>
            {projectOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                <input placeholder="title" value={newProject.title} onChange={e => setNewProject(p => ({ ...p, title: e.target.value }))}
                  style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', outline: 'none', borderRadius: '0.4rem' }} />
                <select value={newProject.status} onChange={e => setNewProject(p => ({ ...p, status: e.target.value }))}
                  style={{ ...mono, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', outline: 'none', borderRadius: '0.4rem' }}>
                  {['active','paused','done'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <textarea placeholder="notes..." value={newProject.notes} onChange={e => setNewProject(p => ({ ...p, notes: e.target.value }))} rows={2}
                  style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', resize: 'vertical', outline: 'none', borderRadius: '0.4rem' }} />
                <button onClick={addProject} style={btnAccent}>add project</button>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 360, overflowY: 'auto' }}>
              {projects.length === 0 && <p style={{ ...muted, opacity: 0.4 }}>none yet.</p>}
              {projects.map(p => (
                <div key={p.id} style={{
                  padding: '0.75rem', border: '1px solid var(--border)',
                  borderRadius: '0.5rem', position: 'relative',
                  opacity: projectWorking === p.id ? 0.4 : 1,
                  background: 'oklch(from var(--bg) calc(l - 0.005) c h)',
                }}>
                  {editingProject?.id === p.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <input value={editingProject.title} onChange={e => setEditingProject(ep => ep ? { ...ep, title: e.target.value } : null)}
                        style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.3rem 0.55rem', outline: 'none', borderRadius: '0.4rem' }} />
                      <select value={editingProject.status} onChange={e => setEditingProject(ep => ep ? { ...ep, status: e.target.value } : null)}
                        style={{ ...mono, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.3rem 0.55rem', outline: 'none', borderRadius: '0.4rem' }}>
                        {['active','paused','done'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <textarea value={editingProject.notes} onChange={e => setEditingProject(ep => ep ? { ...ep, notes: e.target.value } : null)} rows={3}
                        style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.3rem 0.55rem', resize: 'vertical', outline: 'none', borderRadius: '0.4rem' }} />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={saveProject} style={btnAccent}>save</button>
                        <button onClick={() => setEditingProject(null)} style={btnBase}>cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                        <span style={{ ...mono, color: 'var(--text)', fontWeight: 600, fontSize: '0.82rem' }}>{p.title}</span>
                        <span style={{ ...mono, fontSize: '0.6rem', color: statusColor(p.status), opacity: 0.7 }}>{p.status}</span>
                      </div>
                      {p.notes && <p style={{ ...muted, opacity: 0.55, fontSize: '0.78rem', lineHeight: 1.5, marginBottom: '0.4rem', whiteSpace: 'pre-wrap' }}>{p.notes}</p>}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => setEditingProject(p)} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, fontSize: '0.6rem' }}>edit</button>
                        <button onClick={() => deleteProject(p.id)} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, fontSize: '0.6rem' }}>delete</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Activity Log */}
          <section style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={eyeStyle}>Activity Log</div>
              <button onClick={() => { setLogOpen(!logOpen); if (!logOpen) fetchLog(); }}
                style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.45, fontSize: '0.6rem' }}>
                {logOpen ? 'hide' : 'load'}
              </button>
            </div>
            {logOpen && (
              logLoading
                ? <p style={muted}>loading...</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 260, overflowY: 'auto' }}>
                    {log.length === 0 && <p style={{ ...muted, opacity: 0.4 }}>empty.</p>}
                    {log.map((entry: any, i: number) => (
                      <div key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.15rem' }}>
                          <span style={{ ...mono, color: 'var(--accent)', opacity: 0.6, fontSize: '0.6rem' }}>{fmtTime(entry.ts)}</span>
                          <span style={{ ...mono, color: 'var(--muted)', opacity: 0.5, fontSize: '0.6rem' }}>{entry.type ?? 'event'}</span>
                        </div>
                        <p style={{ ...mono, color: 'var(--text)', opacity: 0.75, lineHeight: 1.5, fontSize: '0.78rem' }}>{entry.summary ?? entry.content ?? '(no summary)'}</p>
                      </div>
                    ))}
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

function SessionView({ onVoiceUsed }: { onVoiceUsed: (v: VoiceChannel) => void }) {
  const [phase, setPhase] = useState<SessionPhase>('start');
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<SessionMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState('');
  const [closing, setClosing] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewSaved, setReviewSaved] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function startSession() {
    if (!intent.trim()) return;
    setLoading(true);
    const res = await fetch('/api/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', intent }),
    });
    const data = await res.json();
    setSession(data.session);
    if (data.greeting) setMessages([{ role: 'plex', content: data.greeting }]);
    setPhase('active'); setLoading(false);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading || phase !== 'active') return;
    setInput(''); setLoading(true);
    setMessages(m => [...m, { role: 'joe', content: text }]);
    try {
      const res = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', sessionId: session?.id, message: text }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: 'plex', content: data.reply ?? '(no reply)' }]);
      onVoiceUsed('plex');
    } catch {
      setMessages(m => [...m, { role: 'plex', content: '(unavailable)' }]);
    }
    setLoading(false);
  }

  async function closeSession() {
    if (!session) return; setLoading(true);
    const res = await fetch('/api/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', sessionId: session.id, closingNote: closing }),
    });
    const data = await res.json();
    if (data.closing) setMessages(m => [...m, { role: 'plex', content: data.closing }]);
    setPhase('review'); setLoading(false);
  }

  async function saveReview() {
    if (!session || !reviewNotes.trim()) return; setLoading(true);
    await fetch('/api/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'review', sessionId: session.id, notes: reviewNotes }),
    });
    setReviewSaved(true); setLoading(false);
  }

  const panelStyle: React.CSSProperties = {
    borderRadius: '1rem',
    border: '1px solid rgba(255,255,255,0.055)',
    background: 'oklch(from var(--bg) calc(l + 0.02) c h)',
    padding: '1.5rem',
  };
  const btnBase: React.CSSProperties = {
    ...mono, padding: '0.4rem 1rem', background: 'transparent', color: 'var(--muted)',
    border: '1px solid var(--border)', cursor: 'pointer', borderRadius: '0.5rem',
  };
  const btnAccent: React.CSSProperties = { ...btnBase, background: 'var(--accent)', color: 'var(--bg)', border: 'none' };

  if (phase === 'start') return (
    <div style={{ maxWidth: 600 }}>
      <section style={panelStyle}>
        <div style={eyeStyle}>New Session</div>
        <p style={{ ...muted, opacity: 0.6, marginBottom: '1.5rem', lineHeight: 1.6 }}>What's the intent for this session? She'll load relevant context before we begin.</p>
        <textarea
          placeholder="e.g. work through the sediment framework, debug the voice API..."
          value={intent} onChange={e => setIntent(e.target.value)}
          rows={3}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) startSession(); }}
          style={{
            width: '100%', ...mono, background: 'oklch(from var(--bg) calc(l - 0.01) c h)',
            border: '1px solid var(--border)', color: 'var(--text)',
            padding: '0.75rem 1rem', resize: 'vertical', outline: 'none',
            lineHeight: 1.6, marginBottom: '1rem', borderRadius: '0.5rem',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
        <button onClick={startSession} disabled={loading || !intent.trim()} style={{ ...btnAccent, opacity: intent.trim() ? 1 : 0.4 }}>
          {loading ? 'starting…' : 'begin session'}
        </button>
      </section>
    </div>
  );

  if (phase === 'active') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.25rem', alignItems: 'start' }}>
      <section style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline' }}>
          <div style={eyeStyle}>Session</div>
          <span style={{ ...muted, opacity: 0.5, fontSize: '0.7rem' }}>{session?.intent}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 480, overflowY: 'auto', paddingRight: '0.25rem' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column',
              alignItems: m.role === 'joe' ? 'flex-end' : 'flex-start', gap: '0.15rem' }}>
              <span style={{ ...mono, fontSize: '0.55rem', opacity: 0.4, letterSpacing: '0.08em' }}>{m.role}</span>
              <div style={{
                maxWidth: '85%', padding: '0.65rem 0.9rem',
                background: m.role === 'joe'
                  ? 'oklch(from var(--bg) calc(l + 0.04) c h)'
                  : 'oklch(from var(--bg) calc(l + 0.01) c h)',
                borderLeft: m.role === 'plex' ? '2px solid var(--accent)' : 'none',
                color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.7, borderRadius: '0.5rem',
              }}>{m.content}</div>
            </div>
          ))}
          {loading && <span style={{ ...muted, opacity: 0.4, letterSpacing: '0.2em' }}>…</span>}
          <div ref={bottomRef} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="say something..."
            disabled={loading}
            style={{
              flex: 1, ...mono, background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--text)',
              padding: '0.5rem 0.75rem', outline: 'none',
              transition: 'border-color 120ms', borderRadius: '0.5rem',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()} style={btnAccent}>↑</button>
        </div>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <section style={panelStyle}>
          <div style={eyeStyle}>Close</div>
          <textarea
            placeholder="any closing note..."
            value={closing} onChange={e => setClosing(e.target.value)} rows={3}
            style={{
              width: '100%', ...mono, background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--text)',
              padding: '0.5rem 0.7rem', resize: 'vertical', outline: 'none',
              lineHeight: 1.6, marginBottom: '0.75rem', borderRadius: '0.5rem',
            }}
          />
          <button onClick={closeSession} disabled={loading} style={btnBase}>close session</button>
        </section>

        <section style={panelStyle}>
          <div style={eyeStyle}>Recall tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {(session?.recallTagsLoaded ?? []).length === 0
              ? <p style={{ ...muted, opacity: 0.4, fontSize: '0.7rem' }}>none loaded</p>
              : session?.recallTagsLoaded.map(t => (
                  <span key={t} style={{
                    ...mono, fontSize: '0.6rem', padding: '0.15rem 0.5rem',
                    border: '1px solid var(--border)', color: 'var(--muted)', opacity: 0.6,
                    borderRadius: 999,
                  }}>{t}</span>
                ))
            }
          </div>
        </section>
      </div>
    </div>
  );

  if (phase === 'review') return (
    <div style={{ maxWidth: 600 }}>
      <section style={panelStyle}>
        <div style={eyeStyle}>Review</div>
        {reviewSaved
          ? <p style={{ ...muted, color: 'var(--accent)' }}>review saved. good session.</p>
          : (
            <>
              <p style={{ ...muted, opacity: 0.6, marginBottom: '1rem', lineHeight: 1.6 }}>How did it go? Any notes for next time?</p>
              <textarea
                placeholder="what landed, what didn't, what to carry forward..."
                value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={5}
                style={{
                  width: '100%', ...mono, background: 'transparent',
                  border: '1px solid var(--border)', color: 'var(--text)',
                  padding: '0.75rem 1rem', resize: 'vertical', outline: 'none',
                  lineHeight: 1.6, marginBottom: '1rem', borderRadius: '0.5rem',
                }}
              />
              <button onClick={saveReview} disabled={loading || !reviewNotes.trim()} style={btnAccent}>save review</button>
            </>
          )
        }
      </section>
    </div>
  );

  return null;
}

// ─── View: Spaces ─────────────────────────────────────────────────────────────

function SpacesView({ onVoiceUsed }: { onVoiceUsed: (v: VoiceChannel) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px,100%),1fr))', gap: '1.25rem' }}>
      {VOICES.map(v => (
        <VoiceCard key={v.key} voice={v} onVoiceUsed={onVoiceUsed} />
      ))}
    </div>
  );
}

// ─── Root Shell ───────────────────────────────────────────────────────────────

export default function OnePage() {
  const [view, setView] = useState<View>('one');
  const [phase, setPhase] = useState<SessionPhase>('start');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastVoice, setLastVoice] = useState<VoiceChannel | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  function handleVoiceUsed(v: VoiceChannel) {
    setLastVoice(v);
    if (v === 'plex' && phase !== 'active') {
      setPhase('active');
      setStartedAt(prev => prev ?? Date.now());
    }
  }

  const navItems: { key: View; label: string; glyph: string }[] = [
    { key: 'one',     label: 'one',     glyph: '◐' },
    { key: 'session', label: 'session', glyph: '⋯' },
    { key: 'spaces',  label: 'spaces',  glyph: '◫' },
  ];

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)' }}>
      <SessionStrip phase={phase} startedAt={startedAt} lastVoice={lastVoice} pendingCount={pendingCount} />

      {/* Nav */}
      <nav style={{
        display: 'flex', gap: '0', alignItems: 'center',
        padding: '0 1.25rem',
        borderBottom: '1px solid var(--border)',
        background: 'oklch(from var(--bg) calc(l - 0.005) c h)',
      }}>
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            style={{
              ...mono, padding: '0.75rem 1.1rem',
              background: 'none', border: 'none',
              borderBottom: view === item.key ? '1px solid var(--accent)' : '1px solid transparent',
              color: view === item.key ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
              opacity: view === item.key ? 1 : 0.45,
              transition: 'all 140ms', marginBottom: '-1px',
            }}
          >
            <span style={{ opacity: 0.6 }}>{item.glyph}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={{
        flex: 1, padding: 'clamp(1.5rem,4vw,3rem) clamp(1rem,3vw,2.5rem)',
        maxWidth: 1400, width: '100%', margin: '0 auto',
      }}>
        {view === 'one'     && <OneView />}
        {view === 'session' && <SessionView onVoiceUsed={handleVoiceUsed} />}
        {view === 'spaces'  && <SpacesView onVoiceUsed={handleVoiceUsed} />}
      </main>

      <Footer />
    </div>
  );
}
