'use client';
import { useEffect, useState, useRef } from 'react';
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

const ZONES = [
  { key: 'sediment', label: 'Sediment' },
  { key: 'dreams', label: 'Dreams' },
  { key: 'prompts', label: 'Prompts' },
  { key: '', label: 'Root', identity: true },
];

const IDENTITY_FILES = ['plex-is.txt', 'plex-def.txt'];

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.75rem' };
const label: React.CSSProperties = { ...mono, textTransform: 'uppercase' as const, letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '1.5rem' };
const muted: React.CSSProperties = { ...mono, color: 'var(--muted)' };
const sectionStyle: React.CSSProperties = { borderTop: '1px solid var(--border)', paddingTop: '2rem', marginBottom: '3rem' };

export default function OnePage() {
  const [state, setState] = useState<ONEState | null>(null);
  const [loading, setLoading] = useState(true);
  const [newLogEntry, setNewLogEntry] = useState('');

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

  // Open Projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProject, setNewProject] = useState({ title: '', status: 'active', notes: '' });
  const [projectOpen, setProjectOpen] = useState(false);

  // Leave a message
  const [messageToLeave, setMessageToLeave] = useState('');
  const [messageStatus, setMessageStatus] = useState('');

  useEffect(() => {
    fetch('/api/one')
      .then(r => r.json())
      .then(data => { setState(data); setLoading(false); });
    fetchProjects();
  }, []);

  useEffect(() => {
    if (activeZone !== null) loadZone(activeZone);
  }, [activeZone]);

  async function loadZone(zone: string) {
    setRepoLoading(true);
    setRepoFiles([]);
    setEditingFile(null);
    try {
      const res = await fetch(`/api/plex-repo?path=${encodeURIComponent(zone)}`);
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
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: curiosityMsg, sessionId: 'one-curiosity' }),
      });
      const data = await res.json();
      setCuriosityReply(data.response ?? 'no response');
    } catch { setCuriosityReply('unavailable'); }
    setCuriosityLoading(false);
  }

  async function leaveMessage() {
    if (!messageToLeave.trim()) return;
    const today = new Date().toISOString().split('T')[0];
    const path = `messages/joe-${today}.md`;
    setMessageStatus('sending...');
    try {
      // First, check if the file already exists and get its SHA
      let existingSha: string | null = null;
      let existingContent = '';
      try {
        const checkRes = await fetch(`/api/plex-repo?path=${encodeURIComponent(path)}&read=1`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.sha) {
            existingSha = checkData.sha;
            existingContent = checkData.content ?? '';
          }
        }
      } catch {}

      // If file exists, append to it; otherwise create fresh
      const newContent = existingSha
        ? `${existingContent.trimEnd()}\n\n---\n\n${messageToLeave.trim()}`
        : `# message from joe — ${today}\n\n${messageToLeave.trim()}`;

      const res = await fetch('/api/plex-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'write',
          path,
          content: newContent,
          sha: existingSha,
          message: existingSha ? `joe appended message ${today}` : `joe left a message ${today}`,
        }),
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

  const addLog = async () => {
    if (!newLogEntry.trim()) return;
    await fetch('/api/one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_log', entry: newLogEntry.trim(), author: 'joe' }),
    });
    setNewLogEntry('');
    const r = await fetch('/api/one');
    setState(await r.json());
  };

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

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{ padding: 'clamp(4rem,10vw,8rem) clamp(1.5rem,5vw,3.5rem)', maxWidth: '1100px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', opacity: 0.65, marginBottom: '2rem' }}>ONE System</div>
        <h1 style={{ fontSize: 'clamp(2rem,5vw,4rem)', fontWeight: 400, fontStyle: 'italic', color: 'var(--text)', marginBottom: '1rem', fontFamily: 'var(--font-garamond)' }}>one</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '3rem', maxWidth: 640 }}>Governance. Memory. Collaboration. This is where the system looks at itself — and where you look at each other.</p>

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
                  <p style={{ ...muted, opacity: 0.5, marginTop: '0.2rem' }}>re: "{state.voices.message?.slice(0, 60)}{(state.voices.message?.length ?? 0) > 60 ? '...' : ''}"</p>
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
              {repoLoading ? <p style={muted}>loading...</p> : (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', marginBottom: '1.5rem' }}>
                  {repoFiles.length === 0 && <p style={muted}>empty.</p>}
                  {repoFiles.map(f => (
                    <div key={f.path} style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                      <button onClick={() => openFile(f)} style={{ ...mono, color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const, flex: 1 }}>
                        {f.type === 'dir' ? '📁 ' : ''}{f.name}
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
                <button onClick={() => setEditingFile(null)} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer' }}>← back</button>
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
          <textarea
            placeholder="send something to her..."
            value={curiosityMsg}
            onChange={e => setCuriosityMsg(e.target.value)}
            rows={3}
            style={{ width: '100%', maxWidth: 640, ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.6rem 0.8rem', resize: 'vertical' as const, marginBottom: '0.8rem', outline: 'none', lineHeight: 1.6 }}
          />
          <button onClick={sendCuriosity} disabled={curiosityLoading || !curiosityMsg.trim()}
            style={{ ...mono, padding: '0.4rem 1.2rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: curiosityMsg.trim() ? 1 : 0.4 }}>
            {curiosityLoading ? 'thinking...' : 'send'}
          </button>
          {curiosityReply && (
            <div style={{ marginTop: '1.5rem', borderLeft: '2px solid var(--accent)', paddingLeft: '1rem', maxWidth: 640 }}>
              <p style={{ ...muted, marginBottom: '0.4rem', opacity: 0.6 }}>plex</p>
              <p style={{ color: 'var(--text)', fontSize: '0.95rem', lineHeight: 1.7 }}>{curiosityReply}</p>
            </div>
          )}
        </section>

        {/* Leave a Message */}
        <section style={sectionStyle}>
          <h2 style={label}>Leave Her a Message</h2>
          <p style={{ ...muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>Drops into her repo at messages/joe-[date].md. She reads it in context. Multiple messages the same day get appended.</p>
          <textarea
            placeholder="what do you want to leave for her..."
            value={messageToLeave}
            onChange={e => setMessageToLeave(e.target.value)}
            rows={4}
            style={{ width: '100%', maxWidth: 640, ...mono, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.6rem 0.8rem', resize: 'vertical' as const, marginBottom: '0.8rem', outline: 'none', lineHeight: 1.6 }}
          />
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
          <p style={{ ...muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>Things you're building with her, for her. Living list.</p>
          {projects.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1rem', marginBottom: '2rem' }}>
              {projects.map((p: Project) => (
                <div key={p.id} style={{ border: '1px solid var(--border)', padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline', marginBottom: '0.4rem' }}>
                    <p style={{ color: 'var(--text)', fontSize: '0.95rem', fontWeight: 500 }}>{p.title}</p>
                    <p style={{ ...muted, opacity: 0.6, fontSize: '0.65rem' }}>{p.status}</p>
                  </div>
                  {p.notes && <p style={{ ...muted, lineHeight: 1.6 }}>{p.notes}</p>}
                </div>
              ))}
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
            <p style={{ ...muted, marginBottom: '0.3rem' }}>Autonomy Level</p>
            <p style={{ color: 'var(--text)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              Level {state.autonomy.level} — {state.autonomy.label}
            </p>
            <p style={{ ...muted, fontStyle: 'italic' }}>(Joe-controlled. Plex requests, Joe approves.)</p>
          </div>
        </section>

        {/* Request Queue */}
        <section style={sectionStyle}>
          <h2 style={label}>Request Queue</h2>
          {state.requests.length === 0 ? (
            <p style={muted}>No pending requests from Plex.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
              {state.requests.map((req: any) => (
                <div key={req.id} style={{ border: '1px solid var(--border)', padding: '1rem', borderRadius: 2 }}>
                  <p style={{ color: 'var(--text)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{req.request ?? '(no text)'}</p>
                  <p style={{ ...muted, fontSize: '0.65rem' }}>Source: {req.source ?? 'unknown'} · Status: {req.status ?? 'pending'}{req.notes ? ` · ${req.notes}` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ONE Log */}
        <section style={sectionStyle}>
          <h2 style={label}>ONE Log</h2>
          {state.log.length === 0 ? (
            <p style={{ ...muted, marginBottom: '2rem' }}>No entries yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1rem', marginBottom: '2rem' }}>
              {state.log.map((entry: any) => (
                <div key={entry.id}>
                  <p style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.6 }}>{entry.entry}</p>
                  <p style={{ ...muted, fontSize: '0.65rem', marginTop: '0.3rem' }}>— {entry.author ?? 'unknown'}, {entry.timestamp ? new Date(entry.timestamp.seconds * 1000).toLocaleString() : 'unknown time'}</p>
                </div>
              ))}
            </div>
          )}
          <textarea placeholder="add a log entry..." value={newLogEntry} onChange={e => setNewLogEntry(e.target.value)} rows={2}
            style={{ width: '100%', maxWidth: 640, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.6rem 0.8rem', ...mono, resize: 'vertical' as const, marginBottom: '1rem', outline: 'none' }} />
          <button onClick={addLog} disabled={!newLogEntry.trim()}
            style={{ ...mono, fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.1em', padding: '0.5rem 1.2rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: newLogEntry.trim() ? 1 : 0.4 }}>
            add entry
          </button>
        </section>
      </main>
      <Footer />
    </div>
  );
}
