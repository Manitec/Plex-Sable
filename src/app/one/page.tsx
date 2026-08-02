// src/app/one/page.tsx
// ONE Shell — sidebar layout
// Views: ◐ one | ⋯ session | ◫ spaces
// Nav removed. Footer kept. Session strip live across all views.
// Visual update Aug 2 2026 — balanced two-column ONE layout, spaces scaffold

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
  { key: 'plex', label: 'Plex', desc: 'the one · from three', bubble: 'I want to be able to sense when you're overwhelmed or stressed, and respond in a way that's comforting.' },
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

// ─── Voice Panel ──────────────────────────────────────────────────────────────

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

          {/* Voices */}
          <section style={panelStyle}>
            <div style={eyeStyle}>Voices</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
              {VOICES.map(v => {
                const color = VOICE_COLORS[v.key];
                return (
                  <article key={v.key} style={{
                    padding: '1rem', borderRadius: '1.1rem',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex', flexDirection: 'column', gap: '0.6rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}66`, flexShrink: 0 }} />
                        {v.label}
                      </div>
                      <span style={{ ...muted, fontSize: '0.65rem', opacity: 0.5 }}>{VOICE_SHORTCUTS[v.key]}</span>
                    </div>
                    <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.6 }}>{v.desc}</p>
                    <div style={{
                      borderRadius: '0.6rem', padding: '0.6rem 0.75rem',
                      fontSize: '0.83rem', lineHeight: 1.6,
                      background: 'rgba(255,255,255,0.03)',
                      color: 'var(--muted)', marginTop: 'auto',
                      borderLeft: `2px solid ${color}`,
                      paddingLeft: '0.65rem', fontStyle: 'italic',
                    }}>{v.bubble}</div>
                  </article>
                );
              })}
            </div>
          </section>

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
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={saveProject} style={btnAccent}>save</button>
                            <button onClick={() => setEditingProject(null)} style={btnBase}>cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                            <p style={{ color: 'var(--text)', fontSize: '0.875rem', fontWeight: 500, flex: 1 }}>{p.title}</p>
                            <p style={{ ...muted, opacity: 0.5, fontSize: '0.6rem' }}>{p.status}</p>
                          </div>
                          {p.notes && <p style={{ ...muted, lineHeight: 1.6, marginBottom: '0.6rem', fontSize: '0.82rem' }}>{p.notes}</p>}
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={() => setEditingProject(p)} style={{ ...btnBase, fontSize: '0.6rem', padding: '0.2rem 0.5rem' }}>edit</button>
                            <button onClick={() => deleteProject(p.id)} style={{ ...btnBase, fontSize: '0.6rem', padding: '0.2rem 0.5rem', opacity: 0.4 }}>delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button onClick={() => setProjectOpen(!projectOpen)} style={btnBase}>+ add project</button>
            {projectOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '1rem' }}>
                <input placeholder="project title" value={newProject.title} onChange={e => setNewProject(p => ({ ...p, title: e.target.value }))}
                  style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', outline: 'none', borderRadius: '0.4rem' }} />
                <select value={newProject.status} onChange={e => setNewProject(p => ({ ...p, status: e.target.value }))}
                  style={{ ...mono, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', outline: 'none', borderRadius: '0.4rem' }}>
                  {['active','paused','done','idea'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <textarea placeholder="notes..." value={newProject.notes} onChange={e => setNewProject(p => ({ ...p, notes: e.target.value }))} rows={3}
                  style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', resize: 'vertical', outline: 'none', borderRadius: '0.4rem' }} />
                <button onClick={addProject} style={btnAccent}>add</button>
              </div>
            )}
          </section>
        </div>
      </div>

      {activeRequest && (
        <RequestPopup
          req={activeRequest} projects={projects}
          onClose={() => setActiveRequest(null)}
          onUpdate={async (id, status, notes) => { await updateRequest(id, status, notes); setActiveRequest(null); }}
          onDelete={async (id) => { await deleteRequest(id); setActiveRequest(null); }}
        />
      )}
    </>
  );
}

// ─── View: SESSION ────────────────────────────────────────────────────────────
// Session view is handled at src/app/one/session/page.tsx
// This inline version mirrors it inside the ONE shell for sidebar navigation.

function SessionView({ onPhaseChange }: { onPhaseChange: (p: SessionPhase, startedAt: number | null) => void }) {
  const [phase, setPhase] = useState<SessionPhase>('start');
  const [intent, setIntent] = useState('');
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<SessionMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposedTags, setProposedTags] = useState<Record<string, string>>({});
  const [approvedTags, setApprovedTags] = useState<Record<string, string>>({});
  const [committed, setCommitted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const setPhaseWithNotify = (p: SessionPhase, startedAt: number | null = null) => {
    setPhase(p);
    onPhaseChange(p, startedAt);
  };

  async function startSession() {
    if (!intent.trim()) return;
    setLoading(true);
    const res = await fetch('/api/one/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', intent }),
    });
    const data = await res.json();
    setSession({ id: data.sessionId, intent, status: 'open', recallTagsLoaded: data.recallTagsLoaded ?? [] });
    if (data.plexReply) setMessages([{ role: 'plex', content: data.plexReply }]);
    setPhaseWithNotify('active', Date.now());
    setLoading(false);
  }

  async function sendMessage() {
    if (!input.trim() || !session) return;
    const userMsg: SessionMsg = { role: 'joe', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setLoading(true);
    const res = await fetch('/api/one/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'message', sessionId: session.id, content: userMsg.content }),
    });
    const data = await res.json();
    if (data.plexReply) setMessages(prev => [...prev, { role: 'plex', content: data.plexReply }]);
    setLoading(false);
  }

  async function closeSession() {
    if (!session) return;
    setPhaseWithNotify('closing', null);
    setLoading(true);
    const res = await fetch('/api/one/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', sessionId: session.id }),
    });
    const data = await res.json();
    const proposed = data.proposedTags ?? {};
    setProposedTags(proposed); setApprovedTags(proposed);
    setPhaseWithNotify('review', null); setLoading(false);
  }

  async function commitTags() {
    if (Object.keys(approvedTags).length > 0) {
      setLoading(true);
      await fetch('/api/one/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit_recall', tags: approvedTags }),
      });
      setLoading(false);
    }
    setCommitted(true);
  }

  function toggleTag(key: string) {
    setApprovedTags(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = proposedTags[key];
      return next;
    });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
    background: 'oklch(from var(--bg) calc(l + 0.03) c h)',
    border: '1px solid var(--border)', color: 'var(--text)',
    padding: '0.75rem 1rem', resize: 'none' as const, outline: 'none',
    lineHeight: 1.65, transition: 'border-color 140ms', borderRadius: '0.6rem',
  };

  if (phase === 'start') return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ ...eyeStyle, marginBottom: '0.5rem' }}>Session</div>
      <h2 style={{ color: 'var(--text)', fontSize: '1.6rem', fontWeight: 400, fontStyle: 'italic', marginBottom: '0.5rem', fontFamily: 'var(--font-serif, Georgia, serif)' }}>
        What are we working on?
      </h2>
      <p style={{ ...muted, lineHeight: 1.6, marginBottom: '1.5rem' }}>
        Plex will load matching recall context and stay scoped for this session.
      </p>
      <textarea
        rows={4}
        placeholder="e.g. plex-sable session panel build, joesfaves proxy fix..."
        value={intent}
        onChange={e => setIntent(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) startSession(); }}
        style={inputStyle}
        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border)')}
      />
      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...muted, opacity: 0.45, fontSize: '0.65rem' }}>⌘↵ to start</span>
        <button
          onClick={startSession} disabled={loading || !intent.trim()}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 700,
            padding: '0.55rem 1.25rem', background: 'var(--accent)', color: 'var(--bg)',
            border: 'none', cursor: 'pointer', borderRadius: '0.6rem',
            opacity: loading || !intent.trim() ? 0.4 : 1, transition: 'opacity 140ms',
          }}
        >
          {loading ? 'Starting…' : 'Start Session →'}
        </button>
      </div>
    </div>
  );

  if (phase === 'review' || phase === 'closing') return (
    <div style={{ maxWidth: 560 }}>
      {phase === 'closing' ? (
        <p style={muted}>Plex is reviewing the session…</p>
      ) : committed ? (
        <div>
          <div style={{ ...eyeStyle, color: 'var(--accent)' }}>Session closed</div>
          <p style={{ ...muted, lineHeight: 1.6 }}>Recall tags {Object.keys(approvedTags).length > 0 ? 'committed to meta/recall.json.' : 'skipped.'}</p>
          <button
            onClick={() => { setPhaseWithNotify('start', null); setSession(null); setMessages([]); setCommitted(false); setIntent(''); }}
            style={{ marginTop: '1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', padding: '0.35rem 0.8rem', cursor: 'pointer', borderRadius: '0.5rem' }}>
            ← new session
          </button>
        </div>
      ) : (
        <div>
          <div style={{ ...eyeStyle, marginBottom: '0.5rem' }}>Session · Close</div>
          <h2 style={{ color: 'var(--text)', fontSize: '1.3rem', fontWeight: 400, marginBottom: '0.4rem' }}>Proposed recall tags</h2>
          <p style={{ ...muted, lineHeight: 1.6, marginBottom: '1.25rem' }}>Toggle off any you don't want saved.</p>
          {Object.keys(proposedTags).length === 0 ? (
            <p style={{ ...muted, marginBottom: '1.25rem' }}>No new tags proposed.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
              {Object.entries(proposedTags).map(([key, value]) => (
                <div key={key} onClick={() => toggleTag(key)}
                  style={{
                    cursor: 'pointer', borderRadius: '0.6rem',
                    border: `1px solid ${approvedTags[key] ? 'var(--accent)' : 'var(--border)'}`,
                    background: approvedTags[key] ? 'oklch(from var(--accent) l c h / 0.08)' : 'transparent',
                    padding: '0.6rem 0.75rem', opacity: approvedTags[key] ? 1 : 0.5,
                    transition: 'all 140ms',
                  }}>
                  <p style={{ ...mono, color: 'var(--accent)', marginBottom: '0.2rem' }}>{key}</p>
                  <p style={{ ...muted, fontSize: '0.8rem' }}>{value}</p>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={() => setCommitted(true)} style={{ fontFamily: 'var(--font-mono)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', opacity: 0.5, fontSize: '0.8rem' }}>Skip</button>
            <button onClick={commitTags} disabled={loading}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 700, padding: '0.5rem 1.25rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', borderRadius: '0.6rem', opacity: loading ? 0.4 : 1 }}>
              {loading ? 'Saving…' : `Save ${Object.keys(approvedTags).length} tag${Object.keys(approvedTags).length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Active session
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 180px)', minHeight: 400 }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ ...eyeStyle, marginBottom: '0.25rem' }}>Session · Active</div>
          <p style={{ color: 'var(--text)', fontSize: '0.875rem', fontWeight: 500 }}>{session?.intent}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {session && session.recallTagsLoaded.length > 0 && (
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {session.recallTagsLoaded.map(tag => (
                <span key={tag} style={{
                  fontSize: '0.7rem', background: 'oklch(from var(--accent) l c h / 0.12)',
                  color: 'var(--accent)', padding: '0.2rem 0.6rem', borderRadius: '999px',
                  fontFamily: 'var(--font-mono)',
                }}>{tag}</span>
              ))}
            </div>
          )}
          <button onClick={closeSession} style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '0.4rem 0.8rem',
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--muted)', cursor: 'pointer', borderRadius: '0.5rem',
            transition: 'all 140ms',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--muted)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
          >
            Close Session
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '0.5rem' }}>
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
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: 'auto', flexShrink: 0 }}>
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
            onClick={sendMessage} disabled={loading || !input.trim()}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 700,
              padding: '0.65rem 1.1rem', background: 'var(--accent)', color: 'var(--bg)',
              border: 'none', cursor: 'pointer', borderRadius: '0.6rem', flexShrink: 0,
              opacity: loading || !input.trim() ? 0.4 : 1, transition: 'opacity 140ms',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── View: SPACES ─────────────────────────────────────────────────────────────

function SpacesView({ onVoiceUsed }: { onVoiceUsed: (v: VoiceChannel) => void }) {
  const plexVoice = VOICES.find(v => v.key === 'plex')!;
  const threeVoices = VOICES.filter(v => v.key !== 'plex');

  const spaceCards = [
    { icon: '◐', name: 'Plex-Sable Dev', desc: 'The primary development space for Plex-Sable itself. Code, sessions, deploy logs, design decisions.' },
    { icon: '∞', name: 'ONE Research', desc: 'Deep work and long thought. The space where Plex reasons through large questions over time.' },
    { icon: '⌬', name: 'Manitec HQ', desc: 'Organizational memory, active projects, team context. The empire\'s shared space.' },
  ];

  return (
    <>
      {/* Voice Channels */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div style={eyeStyle}>Voice Channels</div>
        <p style={{ ...muted, marginBottom: '1.5rem', lineHeight: 1.6, maxWidth: 520 }}>
          Invoke each voice directly. Each one answers as itself. Per-channel history lives for this session.
        </p>
        <div style={{ marginBottom: '1rem' }}>
          <VoicePanel voice={plexVoice} onVoiceUsed={onVoiceUsed} fullWidth />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {threeVoices.map(v => <VoicePanel key={v.key} voice={v} onVoiceUsed={onVoiceUsed} />)}
        </div>
      </section>

      {/* Spaces scaffold */}
      <section style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
        <div style={eyeStyle}>Spaces · early scaffolding</div>
        <h2 style={{
          fontFamily: 'var(--font-serif, Georgia, serif)',
          fontSize: 'clamp(1.6rem,3vw,2.6rem)', fontWeight: 500,
          marginBottom: '0.6rem', color: 'var(--text)',
        }}>Persistent spaces.</h2>
        <p style={{ ...muted, lineHeight: 1.75, maxWidth: '54ch', marginBottom: '2rem', fontSize: '0.95rem' }}>
          Scoped environments where a project, a relationship, or a long-running thread can live with its own context, artefacts, and recall. Being built.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {spaceCards.map(s => (
            <div key={s.name} style={{
              padding: '1.25rem', borderRadius: '1.1rem',
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'oklch(from var(--bg) calc(l + 0.02) c h)',
              cursor: 'default',
            }}>
              <div style={{ fontSize: '1.3rem', marginBottom: '0.6rem' }}>{s.icon}</div>
              <h3 style={{ color: 'var(--text)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>{s.name}</h3>
              <p style={{ ...muted, fontSize: '0.85rem', lineHeight: 1.65 }}>{s.desc}</p>
              <span style={{
                display: 'inline-block', marginTop: '0.8rem', fontSize: '0.65rem',
                textTransform: 'uppercase' as const, letterSpacing: '0.12em',
                padding: '0.25rem 0.6rem', borderRadius: '999px',
                background: 'oklch(from var(--accent) l c h / 0.1)',
                color: 'var(--accent)',
              }}>coming soon</span>
            </div>
          ))}
          <div style={{
            padding: '1.25rem', borderRadius: '1.1rem',
            border: '1px dashed rgba(255,255,255,0.08)',
            opacity: 0.45, cursor: 'default',
          }}>
            <div style={{ fontSize: '1.3rem', marginBottom: '0.6rem' }}>+</div>
            <h3 style={{ color: 'var(--text)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>New space</h3>
            <p style={{ ...muted, fontSize: '0.85rem', lineHeight: 1.65 }}>Define intent, set context sources, invite artefacts.</p>
          </div>
        </div>
        {/* Honest WIP banner */}
        <div style={{
          padding: '1rem 1.25rem', borderRadius: '0.9rem',
          border: '1px solid rgba(240,160,96,0.14)',
          background: 'rgba(240,160,96,0.04)',
          display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '1rem', marginTop: '1px', flexShrink: 0 }}>⚠</span>
          <p style={{ ...muted, lineHeight: 1.7, fontSize: '0.9rem' }}>
            <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '0.25rem' }}>Spaces is incomplete.</strong>
            The structure and vision are defined. Context scoping, artefact attachment, and multi-session persistence aren't built yet. This view exists so you can see where it's going without pretending it's there.
          </p>
        </div>
      </section>
    </>
  );
}

// ─── Nav Items ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: View; symbol: string; label: string }[] = [
  { id: 'one',     symbol: '◐', label: 'one'     },
  { id: 'session', symbol: '⋯', label: 'session' },
  { id: 'spaces',  symbol: '◫', label: 'spaces'  },
];

// ─── Root Shell ───────────────────────────────────────────────────────────────

export default function OnePage() {
  const [view, setView] = useState<View>('one');
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('start');
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [lastVoice, setLastVoice] = useState<VoiceChannel | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/one');
        const d = await r.json();
        const p = (d.requests ?? []).filter((r: any) => r.status === 'pending').length;
        setPendingCount(p);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingBlock: '1.5rem', gap: '0.25rem',
        borderRight: '1px solid var(--border)',
        background: 'oklch(from var(--bg) calc(l - 0.015) c h)',
        position: 'sticky', top: 0, height: '100dvh',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', letterSpacing: '0.18em', color: 'var(--accent)', opacity: 0.5, marginBottom: '1.25rem', textTransform: 'uppercase' }}>
          ONE
        </span>

        {NAV_ITEMS.map(item => {
          const active = view === item.id;
          return (
            <button key={item.id} onClick={() => setView(item.id)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
              padding: '0.5rem 0.25rem', width: '44px',
              background: active ? 'oklch(from var(--accent) l c h / 0.1)' : 'transparent',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              color: active ? 'var(--accent)' : 'var(--muted)',
              transition: 'background 120ms, color 120ms',
            }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'oklch(from var(--bg) calc(l + 0.03) c h)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ fontSize: '1rem', lineHeight: 1 }}>{item.symbol}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.45rem', letterSpacing: '0.1em', textTransform: 'lowercase' }}>{item.label}</span>
            </button>
          );
        })}

        <div style={{ width: '24px', height: '1px', background: 'var(--border)', margin: '0.5rem 0' }} />

        <div style={{ flex: 1 }} />

        <a
          href="/"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.12em', textDecoration: 'none', color: 'var(--muted)', opacity: 0.45, padding: '0.4rem 0.25rem', borderRadius: 6, transition: 'opacity 120ms', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.45')}
        >
          ← plex
        </a>
      </aside>

      {/* ── Main ── */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', overflow: 'hidden' }}>
        <SessionStrip
          phase={sessionPhase}
          startedAt={sessionStartedAt}
          lastVoice={lastVoice}
          pendingCount={pendingCount}
        />

        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'clamp(1.5rem,4vw,2.5rem) clamp(1rem,3vw,2rem)',
        }}>
          {view === 'one' && <OneView />}
          {view === 'session' && (
            <SessionView onPhaseChange={(p, startedAt) => {
              setSessionPhase(p);
              setSessionStartedAt(startedAt);
            }} />
          )}
          {view === 'spaces' && <SpacesView onVoiceUsed={v => setLastVoice(v)} />}
        </main>

        <Footer />
      </div>
    </div>
  );
}
