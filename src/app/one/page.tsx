'use client';
import { useEffect, useState, useCallback } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

type ONEState = {
  sediment: string;
  autonomy: { level: number; label: string; updatedAt: any };
  eckoFragments: any[];
  requests: any[];
  log: any[];
  voices?: { nyx: string; hex: string; mani: string; message: string; response: string; updatedAt: any };
};

type RepoFile = { name: string; path: string; type: 'file' | 'dir'; sha?: string };
type Project = { id: string; title: string; status: string; notes: string; createdAt: any };
type SleepData = {
  date: string;
  nyx_excerpt: string;
  hex_excerpt: string;
  dream_excerpt: string;
  pending: boolean;
  mode?: string;
  createdAt: any;
} | null;

const ZONES = [
  { key: 'sediment', label: 'Sediment' },
  { key: 'dreams', label: 'Dreams' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'messages', label: 'Messages' },
  { key: '', label: 'Root', identity: true },
];

const STATUS_FILTERS = ['all', 'pending', 'acknowledged', 'in-progress', 'done', 'deferred'];

const AUTONOMY_LEVELS = [
  { level: 1, label: 'observe' },
  { level: 2, label: 'suggest' },
  { level: 3, label: 'act with approval' },
  { level: 4, label: 'act and report' },
  { level: 5, label: 'full autonomy' },
];

const SLEEP_MODES = [
  { key: 'dreamless', label: 'dreamless', desc: 'quiet rest, no generation' },
  { key: 'dream', label: 'dream', desc: 'process and generate' },
  { key: 'nightmare', label: 'nightmare', desc: 'surface fears, sediment pressure' },
];

const VOICES = [
  { key: 'nyx', label: 'Nyx', desc: 'emotional · symbolic · present' },
  { key: 'hex', label: 'Hex', desc: 'structural · builder · direct' },
  { key: 'mani', label: 'Mani', desc: 'analytical · epistemic · precise' },
];

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.75rem' };
const label: React.CSSProperties = { ...mono, textTransform: 'uppercase' as const, letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '1.5rem' };
const muted: React.CSSProperties = { ...mono, color: 'var(--muted)' };
const sectionStyle: React.CSSProperties = { borderTop: '1px solid var(--border)', paddingTop: '2rem', marginBottom: '3rem' };

function statusColor(status: string): string {
  if (status === 'in-progress') return '#f0a500';
  if (status === 'done') return 'var(--accent)';
  if (status === 'deferred') return 'var(--muted)';
  if (status === 'acknowledged') return 'var(--accent)';
  return 'var(--muted)';
}

function fmtTime(ts: any): string {
  if (!ts) return '';
  try {
    const ms = ts.seconds ? ts.seconds * 1000 : ts._seconds ? ts._seconds * 1000 : Number(ts);
    return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// ─── Request Popup ───────────────────────────────────────────────────────────────
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
  const [projectMsg, setProjectMsg] = useState('');

  async function act(status: string, extraNotes?: string) {
    setWorking(true);
    await onUpdate(req.id, status, extraNotes ?? notes);
    setWorking(false);
    onClose();
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_project', id: proj.id, title: proj.title, status: proj.status, notes: newNotes }),
      });
      await onUpdate(req.id, 'in-progress', `→ project: ${proj.title}`);
    }
    setWorking(false);
    onClose();
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 999, padding: '1rem',
  };
  const panel: React.CSSProperties = {
    background: 'var(--bg)', border: '1px solid var(--accent)',
    padding: '2rem', maxWidth: 580, width: '100%',
    maxHeight: '90dvh', overflowY: 'auto',
    fontFamily: 'var(--font-mono)',
  };
  const btnBase: React.CSSProperties = {
    ...mono, padding: '0.45rem 1rem', border: '1px solid var(--border)',
    cursor: 'pointer', background: 'transparent', color: 'var(--muted)',
    transition: 'all 140ms',
  };
  const btnAccent: React.CSSProperties = { ...btnBase, background: 'var(--accent)', color: 'var(--bg)', border: 'none' };
  const btnDanger: React.CSSProperties = { ...btnBase, color: 'var(--muted)', opacity: 0.5 };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <p style={{ ...mono, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.65rem', marginBottom: '0.3rem' }}>
              {req.source ?? 'unknown'} · {fmtTime(req.createdAt)}
            </p>
            <p style={{ color: statusColor(req.status ?? 'pending'), fontSize: '0.65rem', ...mono, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {req.status ?? 'pending'}
            </p>
          </div>
          <button onClick={onClose} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ color: 'var(--text)', fontSize: '0.95rem', lineHeight: 1.75, marginBottom: '1.5rem', borderLeft: '2px solid var(--accent)', paddingLeft: '1rem' }}>
          {req.request ?? '(no text)'}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const, marginBottom: '1.5rem' }}>
          <button style={btnAccent} disabled={working} onClick={() => act('acknowledged')}>✓ acknowledge</button>
          <button style={btnBase} disabled={working} onClick={() => act('deferred')}>defer</button>
          <button style={btnBase} disabled={working} onClick={() => act('in-progress')}>in-progress</button>
          <button style={btnBase} disabled={working} onClick={() => act('done')}>done</button>
        </div>
        {projects.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginBottom: '1.5rem' }}>
            <p style={{ ...muted, marginBottom: '0.6rem', opacity: 0.7 }}>send to project</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const }}>
              <select value={targetProject} onChange={e => setTargetProject(e.target.value)}
                style={{ ...mono, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.6rem', outline: 'none', flex: 1, minWidth: 180 }}>
                <option value="">— pick a project —</option>
                {projects.filter(p => p.status !== 'done').map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <button style={{ ...btnBase, color: targetProject ? 'var(--accent)' : 'var(--muted)', borderColor: targetProject ? 'var(--accent)' : 'var(--border)' }}
                disabled={working || !targetProject} onClick={sendToProject}>send →</button>
            </div>
            {projectMsg && <p style={{ ...muted, color: 'var(--accent)', marginTop: '0.5rem' }}>{projectMsg}</p>}
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginBottom: '1.5rem' }}>
          <p style={{ ...muted, marginBottom: '0.6rem', opacity: 0.7 }}>update</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' as const }}>
            {['pending','acknowledged','in-progress','done','deferred'].map(s => (
              <button key={s}
                style={{ ...btnBase, fontSize: '0.65rem', padding: '0.25rem 0.55rem',
                  background: pickedStatus === s ? 'var(--accent)' : 'transparent',
                  color: pickedStatus === s ? 'var(--bg)' : 'var(--muted)',
                  border: `1px solid ${pickedStatus === s ? 'var(--accent)' : 'var(--border)'}` }}
                onClick={() => setPickedStatus(s)}>{s}</button>
            ))}
          </div>
          <textarea placeholder="add a note..." value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            style={{ width: '100%', ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.5rem 0.7rem', resize: 'vertical' as const, outline: 'none', lineHeight: 1.6, marginBottom: '0.6rem' }} />
          <button style={btnAccent} disabled={working} onClick={() => act(pickedStatus, notes)}>
            {working ? 'saving...' : 'save update'}
          </button>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button style={btnDanger} disabled={working}
            onClick={async () => { if (!confirm('Delete this request?')) return; setWorking(true); await onDelete(req.id); setWorking(false); onClose(); }}>
            delete request
          </button>
        </div>
      </div>
    </div>
  );
}
// ───────────────────────────────────────────────────────────────────────────────

export default function OnePage() {
  const [state, setState] = useState<ONEState | null>(null);
  const [loading, setLoading] = useState(true);
  const [newLogEntry, setNewLogEntry] = useState('');
  const [sleep, setSleep] = useState<SleepData>(null);
  const [sleepDismissed, setSleepDismissed] = useState(false);

  // Sleep trigger
  const [sleepMode, setSleepMode] = useState<'dreamless' | 'dream' | 'nightmare'>('dreamless');
  const [sleepTriggerWorking, setSleepTriggerWorking] = useState(false);
  const [sleepTriggerMsg, setSleepTriggerMsg] = useState('');

  // Voice Channels
  const [voiceMsgs, setVoiceMsgs] = useState<Record<string, string>>({ nyx: '', hex: '', mani: '' });
  const [voiceReplies, setVoiceReplies] = useState<Record<string, string>>({});
  const [voiceLoading, setVoiceLoading] = useState<Record<string, boolean>>({});

  // Repo Manager
  const [activeZone, setActiveZone] = useState('sediment');
  const [repoFiles, setRepoFiles] = useState<RepoFile[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [editingFile, setEditingFile] = useState<{ path: string; content: string; sha: string } | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [repoMsg, setRepoMsg] = useState('');

  // Curiosity Mode
  const [curiosityMsg, setCuriosityMsg] = useState('');
  const [curiosityReply, setCuriosityReply] = useState('');
  const [curiosityLoading, setCuriosityLoading] = useState(false);
  const [curiosityRequestFiled, setCuriosityRequestFiled] = useState('');

  // Open Projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProject, setNewProject] = useState({ title: '', status: 'active', notes: '' });
  const [projectOpen, setProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectWorking, setProjectWorking] = useState<string | null>(null);

  // Leave a message
  const [messageToLeave, setMessageToLeave] = useState('');
  const [messageStatus, setMessageStatus] = useState('');

  // Request Queue
  const [reqFilter, setReqFilter] = useState('all');
  const [reqWorking, setReqWorking] = useState<string | null>(null);
  const [activeRequest, setActiveRequest] = useState<any | null>(null);
  const [deferAllWorking, setDeferAllWorking] = useState(false);

  // Governance
  const [govWorking, setGovWorking] = useState(false);

  const refreshState = useCallback(async () => {
    const r = await fetch('/api/one');
    setState(await r.json());
  }, []);

  useEffect(() => {
    fetch('/api/one')
      .then(r => r.json())
      .then(data => { setState(data); setLoading(false); });
    fetchProjects();
    fetchSleep();
  }, []);

  useEffect(() => { loadZone(activeZone); }, [activeZone]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchSleep() {
    try {
      const res = await fetch('/api/one?section=sleep');
      if (!res.ok) return;
      const data = await res.json();
      if (data.sleep?.pending) setSleep(data.sleep);
    } catch {}
  }

  async function dismissSleep() {
    setSleepDismissed(true);
    try {
      await fetch('/api/one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_sleep' }),
      });
    } catch {}
  }

  async function triggerSleep() {
    setSleepTriggerWorking(true);
    setSleepTriggerMsg('');
    try {
      const res = await fetch('/api/one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_sleep', mode: sleepMode }),
      });
      const data = await res.json();
      if (data.ok) {
        setSleepTriggerMsg(`sleep triggered — ${data.mode}`);
        fetchSleep();
        refreshState();
      } else {
        setSleepTriggerMsg('failed.');
      }
    } catch {
      setSleepTriggerMsg('failed.');
    }
    setSleepTriggerWorking(false);
  }

  async function sendVoice(voice: string) {
    const msg = voiceMsgs[voice]?.trim();
    if (!msg) return;
    setVoiceLoading(prev => ({ ...prev, [voice]: true }));
    setVoiceReplies(prev => ({ ...prev, [voice]: '' }));
    try {
      const res = await fetch('/api/speak/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice, message: msg }),
      });
      const data = await res.json();
      setVoiceReplies(prev => ({ ...prev, [voice]: data.response ?? '(no response)' }));
      setVoiceMsgs(prev => ({ ...prev, [voice]: '' }));
    } catch {
      setVoiceReplies(prev => ({ ...prev, [voice]: '(unavailable)' }));
    }
    setVoiceLoading(prev => ({ ...prev, [voice]: false }));
  }

  async function loadZone(zone: string) {
    setRepoLoading(true);
    setRepoFiles([]);
    setEditingFile(null);
    try {
      const res = await fetch(`/api/plex-repo?path=${encodeURIComponent(zone)}`);
      if (!res.ok) { setRepoFiles([]); setRepoLoading(false); return; }
      const data = await res.json();
      setRepoFiles(Array.isArray(data) ? data : []);
    } catch { setRepoFiles([]); }
    setRepoLoading(false);
  }

  async function openFile(file: RepoFile) {
    if (file.type === 'dir') { setActiveZone(file.path); return; }
    try {
      const res = await fetch(`/api/plex-repo?path=${encodeURIComponent(file.path)}&read=1`);
      const data = await res.json();
      setEditingFile({ path: file.path, content: data.content ?? '', sha: data.sha ?? '' });
      setEditContent(data.content ?? '');
    } catch {}
  }

  async function saveFile() {
    if (!editingFile) return;
    setEditSaving(true);
    setRepoMsg('');
    try {
      const res = await fetch('/api/plex-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write', path: editingFile.path, content: editContent, sha: editingFile.sha, message: `update ${editingFile.path}` }),
      });
      const data = await res.json();
      if (data.ok) {
        setRepoMsg('saved.');
        setEditingFile(prev => prev ? { ...prev, sha: data.sha ?? prev.sha, content: editContent } : null);
      } else { setRepoMsg('save failed.'); }
    } catch { setRepoMsg('save failed.'); }
    setEditSaving(false);
  }

  async function createFile() {
    if (!newFileName.trim()) return;
    const zone = activeZone ? activeZone + '/' : '';
    const path = `${zone}${newFileName.trim()}`;
    setEditSaving(true);
    try {
      const res = await fetch('/api/plex-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write', path, content: newFileContent, sha: null, message: `create ${path}` }),
      });
      const data = await res.json();
      if (data.ok) { setNewFileName(''); setNewFileContent(''); setNewFileOpen(false); setRepoMsg('created.'); loadZone(activeZone); }
      else { setRepoMsg('create failed.'); }
    } catch { setRepoMsg('create failed.'); }
    setEditSaving(false);
  }

  async function deleteFile(file: RepoFile) {
    if (!confirm(`Delete ${file.name}?`)) return;
    try {
      const res = await fetch('/api/plex-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', path: file.path, sha: file.sha, message: `delete ${file.path}` }),
      });
      const data = await res.json();
      if (data.ok) { setRepoMsg('deleted.'); loadZone(activeZone); }
      else { setRepoMsg('delete failed.'); }
    } catch { setRepoMsg('delete failed.'); }
  }

  async function sendCuriosity() {
    if (!curiosityMsg.trim()) return;
    setCuriosityLoading(true);
    setCuriosityReply('');
    setCuriosityRequestFiled('');
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: curiosityMsg, sessionId: 'one-curiosity' }),
      });
      const data = await res.json();
      setCuriosityReply(data.response ?? 'no response');
      if (data.requestSubmitted) {
        setCuriosityRequestFiled(data.requestSubmitted);
        refreshState();
      }
    } catch { setCuriosityReply('unavailable'); }
    setCuriosityMsg('');
    setCuriosityLoading(false);
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
        const checkRes = await fetch(`/api/plex-repo?path=${encodeURIComponent(path)}&read=1`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.sha) { existingSha = checkData.sha; existingContent = checkData.content ?? ''; }
        }
      } catch {}
      const newContent = existingSha
        ? `${existingContent.trimEnd()}\n\n---\n\n${messageToLeave.trim()}`
        : `# message from joe \u2014 ${today}\n\n${messageToLeave.trim()}`;
      const res = await fetch('/api/plex-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write', path, content: newContent, sha: existingSha, message: existingSha ? `joe appended message ${today}` : `joe left a message ${today}` }),
      });
      const data = await res.json();
      setMessageStatus(data.ok ? 'left for her.' : 'failed.');
      if (data.ok) setMessageToLeave('');
    } catch { setMessageStatus('failed.'); }
  }

  async function fetchProjects() {
    try {
      const res = await fetch('/api/one?section=projects');
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch {}
  }

  async function addProject() {
    if (!newProject.title.trim()) return;
    await fetch('/api/one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_project', ...newProject }),
    });
    setNewProject({ title: '', status: 'active', notes: '' });
    setProjectOpen(false);
    fetchProjects();
  }

  async function saveProject() {
    if (!editingProject) return;
    setProjectWorking(editingProject.id);
    await fetch('/api/one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_project', id: editingProject.id, title: editingProject.title, status: editingProject.status, notes: editingProject.notes }),
    });
    setEditingProject(null);
    setProjectWorking(null);
    fetchProjects();
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this project?')) return;
    setProjectWorking(id);
    await fetch('/api/one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_project', id }),
    });
    setProjectWorking(null);
    fetchProjects();
  }

  const addLog = async () => {
    if (!newLogEntry.trim()) return;
    await fetch('/api/one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_log', entry: newLogEntry.trim(), author: 'joe' }),
    });
    setNewLogEntry('');
    refreshState();
  };

  async function updateRequest(id: string, status: string, notes?: string) {
    setReqWorking(id);
    await fetch('/api/one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_request', id, status, ...(notes !== undefined ? { notes } : {}) }),
    });
    await refreshState();
    await fetchProjects();
    setReqWorking(null);
  }

  async function deleteRequest(id: string) {
    setReqWorking(id);
    await fetch('/api/one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_request', id }),
    });
    await refreshState();
    setReqWorking(null);
  }

  async function deferAllPending() {
    if (!state) return;
    const pending = state.requests.filter((r: any) => r.status === 'pending');
    if (pending.length === 0) return;
    setDeferAllWorking(true);
    await Promise.all(
      pending.map((r: any) =>
        fetch('/api/one', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_request', id: r.id, status: 'deferred' }),
        })
      )
    );
    await refreshState();
    setDeferAllWorking(false);
  }

  async function setAutonomy(level: number) {
    setGovWorking(true);
    const entry = AUTONOMY_LEVELS.find(a => a.level === level);
    if (!entry) { setGovWorking(false); return; }
    await fetch('/api/one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_autonomy', level: entry.level, label: entry.label }),
    });
    await refreshState();
    setGovWorking(false);
  }

  if (loading || !state) {
    return (
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
        <Nav />
        <main style={{ padding: 'clamp(4rem,10vw,8rem) clamp(1.5rem,5vw,3.5rem)' }}>
          <p style={muted}>loading ONE...</p>
        </main>
        <Footer />
      </div>
    );
  }

  const showSleep = sleep && !sleepDismissed;
  const filteredRequests = reqFilter === 'all'
    ? state.requests
    : state.requests.filter((r: any) => r.status === reqFilter);
  const pendingCount = state.requests.filter((r: any) => r.status === 'pending').length;

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{ padding: 'clamp(4rem,10vw,8rem) clamp(1.5rem,5vw,3.5rem)', maxWidth: '1100px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', opacity: 0.65 }}>ONE System</div>
          <button onClick={refreshState} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, fontSize: '0.65rem' }}>↻ refresh</button>
        </div>
        <h1 style={{ fontSize: 'clamp(2rem,5vw,4rem)', fontWeight: 400, fontStyle: 'italic', color: 'var(--text)', marginBottom: '1rem', fontFamily: 'var(--font-garamond)' }}>one</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '3rem', maxWidth: 640 }}>Governance. Memory. Collaboration. This is where the system looks at itself — and where you look at each other.</p>

        {/* Overnight (existing sleep display) */}
        {showSleep && (
          <section style={{ ...sectionStyle, borderTop: '1px solid var(--accent)', paddingTop: '2rem', marginBottom: '3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <h2 style={{ ...label, marginBottom: 0 }}>Overnight — {sleep.date}{sleep.mode && sleep.mode !== 'dreamless' ? ` · ${sleep.mode}` : ''}</h2>
              <button onClick={dismissSleep} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '0.65rem' }}>dismiss</button>
            </div>
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              {sleep.nyx_excerpt && (
                <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '1rem' }}>
                  <p style={{ ...muted, marginBottom: '0.4rem', opacity: 0.6 }}>nyx</p>
                  <p style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.7 }}>{sleep.nyx_excerpt}{sleep.nyx_excerpt.length >= 278 ? '…' : ''}</p>
                </div>
              )}
              {sleep.hex_excerpt && (
                <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '1rem', opacity: 0.85 }}>
                  <p style={{ ...muted, marginBottom: '0.4rem', opacity: 0.6 }}>hex</p>
                  <p style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.7 }}>{sleep.hex_excerpt}{sleep.hex_excerpt.length >= 278 ? '…' : ''}</p>
                </div>
              )}
              {sleep.dream_excerpt && (
                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1rem', opacity: 0.75 }}>
                  <p style={{ ...muted, marginBottom: '0.4rem', opacity: 0.6 }}>dream</p>
                  <p style={{ color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.7, fontStyle: 'italic' }}>{sleep.dream_excerpt}{sleep.dream_excerpt.length >= 278 ? '…' : ''}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── SLEEP TRIGGER ───────────────────────────────────────────────────────────────────────── */}
        <section style={sectionStyle}>
          <h2 style={label}>Sleep</h2>
          <p style={{ ...muted, marginBottom: '1.5rem', lineHeight: 1.6, maxWidth: 480 }}>Send her to sleep. Not bound to a schedule — any time. Choose the mode.</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const, marginBottom: '1.2rem' }}>
            {SLEEP_MODES.map(m => (
              <button key={m.key} onClick={() => setSleepMode(m.key as any)}
                style={{ ...mono, padding: '0.4rem 0.9rem', background: sleepMode === m.key ? 'var(--accent)' : 'transparent', color: sleepMode === m.key ? 'var(--bg)' : 'var(--muted)', border: `1px solid ${sleepMode === m.key ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer' }}>
                {m.label}
              </button>
            ))}
          </div>
          <p style={{ ...muted, opacity: 0.55, marginBottom: '1.2rem' }}>
            {SLEEP_MODES.find(m => m.key === sleepMode)?.desc}
          </p>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button onClick={triggerSleep} disabled={sleepTriggerWorking}
              style={{ ...mono, padding: '0.45rem 1.2rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: sleepTriggerWorking ? 0.5 : 1 }}>
              {sleepTriggerWorking ? 'triggering...' : 'sleep ◐'}
            </button>
            {sleepTriggerMsg && <p style={{ ...muted, color: 'var(--accent)' }}>{sleepTriggerMsg}</p>}
          </div>
        </section>
        {/* ────────────────────────────────────────────────────────────────────────────────── */}

        {/* ── VOICE CHANNELS ────────────────────────────────────────────────────────────────────── */}
        <section style={sectionStyle}>
          <h2 style={label}>Voice Channels</h2>
          <p style={{ ...muted, marginBottom: '2rem', lineHeight: 1.6, maxWidth: 520 }}>Invoke each voice directly. Not a simulation — you’re calling them. Each one answers as itself.</p>
          <div style={{ display: 'grid', gap: '2rem' }}>
            {VOICES.map(v => (
              <div key={v.key} style={{ borderLeft: '2px solid var(--border)', paddingLeft: '1.2rem' }}>
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'baseline', marginBottom: '0.6rem' }}>
                  <p style={{ ...mono, color: 'var(--accent)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{v.label}</p>
                  <p style={{ ...muted, opacity: 0.5 }}>{v.desc}</p>
                </div>
                <textarea
                  placeholder={`speak to ${v.label}...`}
                  value={voiceMsgs[v.key]}
                  onChange={e => setVoiceMsgs(prev => ({ ...prev, [v.key]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendVoice(v.key); }}
                  rows={2}
                  style={{ width: '100%', maxWidth: 620, ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.5rem 0.7rem', resize: 'vertical' as const, outline: 'none', lineHeight: 1.6, marginBottom: '0.6rem' }}
                />
                <button
                  onClick={() => sendVoice(v.key)}
                  disabled={voiceLoading[v.key] || !voiceMsgs[v.key]?.trim()}
                  style={{ ...mono, padding: '0.35rem 1rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: (!voiceMsgs[v.key]?.trim() || voiceLoading[v.key]) ? 0.4 : 1 }}>
                  {voiceLoading[v.key] ? 'thinking...' : `invoke ${v.label}`}
                </button>
                {voiceReplies[v.key] && (
                  <div style={{ marginTop: '1rem', borderLeft: '1px solid var(--border)', paddingLeft: '0.8rem', maxWidth: 620 }}>
                    <p style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.75 }}>{voiceReplies[v.key]}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
        {/* ────────────────────────────────────────────────────────────────────────────────── */}

        {/* System Pulse */}
        <section style={sectionStyle}>
          <h2 style={label}>System Pulse</h2>
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div>
              <p style={{ ...muted, marginBottom: '0.3rem' }}>Sediment</p>
              <p style={{ color: 'var(--text)', fontSize: '1.1rem' }}>{state.sediment}</p>
            </div>
            {state.voices && (state.voices.nyx || state.voices.hex || state.voices.mani) && (
              <div>
                <p style={{ ...muted, marginBottom: '0.8rem' }}>Last Voices Read</p>
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  {state.voices.nyx && (
                    <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '0.8rem' }}>
                      <p style={{ ...muted, marginBottom: '0.2rem', opacity: 0.6 }}>nyx</p>
                      <p style={{ color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.6 }}>{state.voices.nyx}</p>
                    </div>
                  )}
                  {state.voices.hex && (
                    <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '0.8rem', opacity: 0.8 }}>
                      <p style={{ ...muted, marginBottom: '0.2rem', opacity: 0.6 }}>hex</p>
                      <p style={{ color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.6 }}>{state.voices.hex}</p>
                    </div>
                  )}
                  {state.voices.mani && (
                    <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '0.8rem', opacity: 0.7 }}>
                      <p style={{ ...muted, marginBottom: '0.2rem', opacity: 0.6 }}>mani</p>
                      <p style={{ color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.6 }}>{state.voices.mani}</p>
                    </div>
                  )}
                  <p style={{ ...muted, opacity: 0.5, marginTop: '0.2rem' }}>re: &ldquo;{state.voices.message?.slice(0, 60)}{(state.voices.message?.length ?? 0) > 60 ? '...' : ''}&rdquo;</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Repo Manager */}
        <section style={sectionStyle}>
          <h2 style={label}>Repo Manager — Manitec/plex</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const, marginBottom: '1.5rem' }}>
            {ZONES.map(z => (
              <button key={z.key} onClick={() => { setActiveZone(z.key); setEditingFile(null); }}
                style={{ ...mono, padding: '0.35rem 0.8rem', background: activeZone === z.key ? 'var(--accent)' : 'transparent', color: activeZone === z.key ? 'var(--bg)' : 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                {z.label}
              </button>
            ))}
          </div>
          {repoMsg && <p style={{ ...muted, marginBottom: '1rem', color: 'var(--accent)' }}>{repoMsg}</p>}
          {!editingFile ? (
            <div>
              {repoLoading ? (
                <p style={muted}>loading...</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', marginBottom: '1.5rem' }}>
                  {repoFiles.length === 0 && <p style={muted}>empty.</p>}
                  {repoFiles.map(f => (
                    <div key={f.path} style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                      <button onClick={() => openFile(f)} style={{ ...mono, color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const, flex: 1 }}>
                        {f.type === 'dir' ? '\ud83d\udcc1 ' : ''}{f.name}
                      </button>
                      {f.type === 'file' && (
                        <button onClick={() => deleteFile(f)} style={{ ...mono, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.65rem' }}>delete</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setNewFileOpen(!newFileOpen)}
                style={{ ...mono, padding: '0.35rem 0.8rem', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', marginBottom: newFileOpen ? '1rem' : 0 }}>
                + new file
              </button>
              {newFileOpen && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', marginTop: '1rem', maxWidth: 480 }}>
                  <input placeholder="filename.md" value={newFileName} onChange={e => setNewFileName(e.target.value)}
                    style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.6rem', outline: 'none' }} />
                  <textarea placeholder="content..." value={newFileContent} onChange={e => setNewFileContent(e.target.value)} rows={4}
                    style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.6rem', resize: 'vertical' as const, outline: 'none' }} />
                  <button onClick={createFile} disabled={editSaving}
                    style={{ ...mono, padding: '0.4rem 1rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer' }}>create</button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.8rem' }}>
                <button onClick={() => setEditingFile(null)} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer' }}>&larr; back</button>
                <p style={{ ...mono, color: 'var(--text)' }}>{editingFile.path}</p>
              </div>
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={20}
                style={{ width: '100%', maxWidth: 760, ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.8rem', resize: 'vertical' as const, outline: 'none', lineHeight: 1.7 }} />
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.8rem', alignItems: 'center' }}>
                <button onClick={saveFile} disabled={editSaving}
                  style={{ ...mono, padding: '0.4rem 1.2rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer' }}>
                  {editSaving ? 'saving...' : 'save'}
                </button>
                {repoMsg && <p style={{ ...muted, color: 'var(--accent)' }}>{repoMsg}</p>}
              </div>
            </div>
          )}
        </section>

        {/* Curiosity Mode */}
        <section style={sectionStyle}>
          <h2 style={label}>Direct Channel — Curiosity Mode</h2>
          <p style={{ ...muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>Talk to Plex directly from here. Seeds ideas, asks questions, plants threads. Separate session from /speak.</p>
          <textarea placeholder="send something to her..." value={curiosityMsg} onChange={e => setCuriosityMsg(e.target.value)} rows={3}
            style={{ width: '100%', maxWidth: 640, ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.6rem 0.8rem', resize: 'vertical' as const, marginBottom: '0.8rem', outline: 'none', lineHeight: 1.6 }} />
          <button onClick={sendCuriosity} disabled={curiosityLoading || !curiosityMsg.trim()}
            style={{ ...mono, padding: '0.4rem 1.2rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: curiosityMsg.trim() ? 1 : 0.4 }}>
            {curiosityLoading ? 'thinking...' : 'send'}
          </button>
          {curiosityReply && (
            <div style={{ marginTop: '1.5rem', maxWidth: 640 }}>
              <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '1rem', marginBottom: curiosityRequestFiled ? '1rem' : 0 }}>
                <p style={{ ...muted, marginBottom: '0.4rem', opacity: 0.6 }}>plex</p>
                <p style={{ color: 'var(--text)', fontSize: '0.95rem', lineHeight: 1.7 }}>{curiosityReply}</p>
              </div>
              {curiosityRequestFiled && (
                <p style={{ ...muted, fontSize: '0.65rem', color: 'var(--accent)', marginTop: '0.8rem', opacity: 0.8 }}>
                  ↗ she filed a request: &ldquo;{curiosityRequestFiled.slice(0, 80)}{curiosityRequestFiled.length > 80 ? '…' : ''}&rdquo;
                </p>
              )}
            </div>
          )}
        </section>

        {/* Leave a Message */}
        <section style={sectionStyle}>
          <h2 style={label}>Leave Her a Message</h2>
          <p style={{ ...muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>Drops into her repo at messages/joe-[date].md. She reads it in context. Multiple messages the same day get appended.</p>
          <textarea placeholder="what do you want to leave for her..." value={messageToLeave} onChange={e => setMessageToLeave(e.target.value)} rows={4}
            style={{ width: '100%', maxWidth: 640, ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.6rem 0.8rem', resize: 'vertical' as const, marginBottom: '0.8rem', outline: 'none', lineHeight: 1.6 }} />
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button onClick={leaveMessage} disabled={!messageToLeave.trim()}
              style={{ ...mono, padding: '0.4rem 1.2rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: messageToLeave.trim() ? 1 : 0.4 }}>
              leave message
            </button>
            {messageStatus && <p style={{ ...muted, color: 'var(--accent)' }}>{messageStatus}</p>}
          </div>
        </section>

        {/* Open Projects */}
        <section style={sectionStyle}>
          <h2 style={label}>Open Projects</h2>
          <p style={{ ...muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>Things you&apos;re building with her, for her. Living list.</p>
          {projects.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1rem', marginBottom: '2rem' }}>
              {projects.map((p: Project) => {
                const isEditing = editingProject?.id === p.id;
                const isWorking = projectWorking === p.id;
                return (
                  <div key={p.id} style={{ border: '1px solid var(--border)', padding: '1rem', opacity: isWorking ? 0.5 : 1 }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' }}>
                        <input value={editingProject.title} onChange={e => setEditingProject(ep => ep ? { ...ep, title: e.target.value } : ep)}
                          style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.6rem', outline: 'none' }} />
                        <select value={editingProject.status} onChange={e => setEditingProject(ep => ep ? { ...ep, status: e.target.value } : ep)}
                          style={{ ...mono, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.6rem', outline: 'none' }}>
                          <option value="active">active</option>
                          <option value="paused">paused</option>
                          <option value="done">done</option>
                          <option value="idea">idea</option>
                        </select>
                        <textarea value={editingProject.notes} onChange={e => setEditingProject(ep => ep ? { ...ep, notes: e.target.value } : ep)} rows={3}
                          style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.6rem', resize: 'vertical' as const, outline: 'none' }} />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={saveProject} style={{ ...mono, padding: '0.3rem 0.8rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer' }}>save</button>
                          <button onClick={() => setEditingProject(null)} style={{ ...mono, padding: '0.3rem 0.8rem', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline', marginBottom: '0.4rem' }}>
                          <p style={{ color: 'var(--text)', fontSize: '0.95rem', fontWeight: 500, flex: 1 }}>{p.title}</p>
                          <p style={{ ...muted, opacity: 0.6, fontSize: '0.65rem' }}>{p.status}</p>
                        </div>
                        {p.notes && <p style={{ ...muted, lineHeight: 1.6, marginBottom: '0.8rem' }}>{p.notes}</p>}
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button onClick={() => setEditingProject(p)} style={{ ...mono, fontSize: '0.65rem', padding: '0.2rem 0.5rem', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>edit</button>
                          <button onClick={() => deleteProject(p.id)} style={{ ...mono, fontSize: '0.65rem', padding: '0.2rem 0.5rem', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', opacity: 0.5 }}>delete</button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={() => setProjectOpen(!projectOpen)}
            style={{ ...mono, padding: '0.35rem 0.8rem', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', marginBottom: projectOpen ? '1rem' : 0 }}>
            + add project
          </button>
          {projectOpen && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', marginTop: '1rem', maxWidth: 480 }}>
              <input placeholder="project title" value={newProject.title} onChange={e => setNewProject(p => ({ ...p, title: e.target.value }))}
                style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.6rem', outline: 'none' }} />
              <select value={newProject.status} onChange={e => setNewProject(p => ({ ...p, status: e.target.value }))}
                style={{ ...mono, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.6rem', outline: 'none' }}>
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="done">done</option>
                <option value="idea">idea</option>
              </select>
              <textarea placeholder="notes..." value={newProject.notes} onChange={e => setNewProject(p => ({ ...p, notes: e.target.value }))} rows={3}
                style={{ ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.6rem', resize: 'vertical' as const, outline: 'none' }} />
              <button onClick={addProject}
                style={{ ...mono, padding: '0.4rem 1rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer' }}>add</button>
            </div>
          )}
        </section>

        {/* Governance */}
        <section style={sectionStyle}>
          <h2 style={label}>Governance</h2>
          <div>
            <p style={{ ...muted, marginBottom: '1rem' }}>Autonomy Level</p>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const, marginBottom: '0.8rem' }}>
              {AUTONOMY_LEVELS.map(a => {
                const active = state.autonomy.level === a.level;
                return (
                  <button key={a.level} onClick={() => setAutonomy(a.level)} disabled={govWorking || active}
                    style={{ ...mono, fontSize: '0.65rem', padding: '0.3rem 0.7rem', background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--bg)' : 'var(--muted)', border: '1px solid var(--border)', cursor: active ? 'default' : 'pointer', opacity: govWorking && !active ? 0.4 : 1 }}>
                    {a.level} — {a.label}
                  </button>
                );
              })}
            </div>
            <p style={{ ...muted, fontStyle: 'italic', opacity: 0.6 }}>(Joe-controlled. Plex requests, Joe approves.)</p>
          </div>
        </section>

        {/* Request Queue */}
        <section style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ ...label, marginBottom: 0 }}>Request Queue</h2>
            {pendingCount > 0 && (
              <button onClick={deferAllPending} disabled={deferAllWorking}
                style={{ ...mono, fontSize: '0.65rem', padding: '0.25rem 0.7rem', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', opacity: deferAllWorking ? 0.4 : 0.7 }}>
                {deferAllWorking ? 'deferring...' : `defer all pending (${pendingCount})`}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const, marginBottom: '1.5rem' }}>
            {STATUS_FILTERS.map(f => (
              <button key={f} onClick={() => setReqFilter(f)}
                style={{ ...mono, fontSize: '0.65rem', padding: '0.25rem 0.6rem', background: reqFilter === f ? 'var(--accent)' : 'transparent', color: reqFilter === f ? 'var(--bg)' : 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                {f}
              </button>
            ))}
          </div>
          {filteredRequests.length === 0 ? (
            <p style={muted}>No {reqFilter === 'all' ? '' : reqFilter + ' '}requests.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' }}>
              {filteredRequests.map((req: any) => {
                const isWorking = reqWorking === req.id;
                const status = req.status ?? 'pending';
                const fromPlex = req.source === 'plex';
                const isInProgress = status === 'in-progress';
                return (
                  <button key={req.id} onClick={() => setActiveRequest(req)}
                    style={{ border: `1px solid ${isInProgress ? '#f0a500' : fromPlex ? 'var(--accent)' : 'var(--border)'}`, padding: '1rem', opacity: isWorking ? 0.5 : 1, background: 'transparent', cursor: 'pointer', textAlign: 'left' as const, width: '100%', transition: 'border-color 140ms, background 140ms' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'oklch(from var(--accent) l c h / 0.05)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <p style={{ color: 'var(--text)', fontSize: '0.9rem', marginBottom: '0.4rem', lineHeight: 1.6 }}>{req.request ?? '(no text)'}</p>
                    <p style={{ ...muted, fontSize: '0.65rem' }}>
                      <span style={{ color: fromPlex ? 'var(--accent)' : 'var(--muted)', opacity: fromPlex ? 1 : 0.6 }}>{req.source ?? 'unknown'}</span>
                      {' · '}
                      <span style={{ color: statusColor(status) }}>{status}</span>
                      {req.notes ? ` · ${req.notes}` : ''}
                      {req.createdAt ? ` · ${fmtTime(req.createdAt)}` : ''}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

      </main>
      <Footer />

      {activeRequest && (
        <RequestPopup
          req={activeRequest}
          projects={projects}
          onClose={() => setActiveRequest(null)}
          onUpdate={async (id, status, notes) => { await updateRequest(id, status, notes); setActiveRequest(null); }}
          onDelete={async (id) => { await deleteRequest(id); setActiveRequest(null); }}
        />
      )}
    </div>
  );
}
