'use client';
import { useState, useEffect, useRef } from 'react';

// ── Config ───────────────────────────────────────────────────────
const OWNER  = 'Manitec';
const REPO   = 'plex';
const BRANCH = 'main';
const BASE   = `https://api.github.com/repos/${OWNER}/${REPO}`;
const ZONES  = ['sediment','dreams','visual-identity','void-space'] as const;
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','avif','bmp']);
const MIME: Record<string,string> = { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',avif:'image/avif',bmp:'image/bmp' };
const TIERS = ['primary','special','core','adjacent','uncategorised'] as const;
const TIER_LABELS: Record<string,string> = { primary:'⭐ Primary',special:'🔖 Special',core:'Core',adjacent:'Adjacent',uncategorised:'Uncategorised' };
const PROFILE_PATH = 'visual-identity/profile.json';
type Zone = typeof ZONES[number];
type Tier = typeof TIERS[number];
type View = 'identity'|'visual-profile'|Zone|'new-sediment'|'new-file';
interface ProfileItem { file: string; note?: string; }
interface Profile { notes?: string; tiers: Record<Tier,ProfileItem[]>; updated?: string; }

function isImage(name: string) { return IMAGE_EXTS.has(name.split('.').pop()?.toLowerCase() ?? ''); }
function getMime(name: string) { return MIME[name.split('.').pop()?.toLowerCase()??''] ?? 'image/png'; }
function escHTML(s: string) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtBytes(b: number) { return b < 1024 ? b+' B' : (b/1024).toFixed(1)+' KB'; }
function encodePath(p: string) { return p.split('/').map(encodeURIComponent).join('/'); }

export default function ManagePage() {
  const [token, setToken]       = useState('');
  const [tokenInput, setTI]     = useState('');
  const [authError, setAuthErr] = useState('');
  const [authed, setAuthed]     = useState(false);
  const [view, setView]         = useState<View>('visual-profile');
  const [toast, setToast]       = useState<{msg:string;type:string}|null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // ── Token persistence (memory only — no localStorage in sandbox)
  function showToast(msg: string, type = 'default') {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }

  async function ghFetch(path: string, opts: RequestInit = {}) {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: { Authorization:`token ${token}`, Accept:'application/vnd.github.v3+json', 'Content-Type':'application/json', ...(opts.headers??{}) },
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})) as {message?:string}; throw new Error(e.message??`HTTP ${res.status}`); }
    if (res.status === 204) return null;
    return res.json();
  }

  async function authenticate(tok: string) {
    const res = await fetch('https://api.github.com/user', { headers:{ Authorization:`token ${tok}` } });
    if (!res.ok) throw new Error('Invalid token');
    return res.json();
  }

  async function handleLogin() {
    if (!tokenInput.trim()) return;
    setAuthErr('');
    try {
      await authenticate(tokenInput.trim());
      setToken(tokenInput.trim());
      setAuthed(true);
    } catch(e: unknown) { setAuthErr(e instanceof Error ? e.message : 'Auth failed'); }
  }

  // ── Render ───────────────────────────────────────────────────────
  if (!authed) return <AuthGate tokenInput={tokenInput} setTI={setTI} handleLogin={handleLogin} authError={authError} />;

  const navItems: { label: string; view: View }[] = [
    { label:'◐ texts',          view:'identity' },
    { label:'◫ visual profile', view:'visual-profile' },
    { label:'⋯ sediment',       view:'sediment' },
    { label:'◌ dreams',         view:'dreams' },
    { label:'◫ visual-identity',view:'visual-identity' },
    { label:'▣ void-space',     view:'void-space' },
    { label:'⋯ new sediment',   view:'new-sediment' },
    { label:'+ new file',       view:'new-file' },
  ];

  return (
    <div style={{ display:'flex', height:'calc(100dvh - 73px)', overflow:'hidden', fontFamily:'var(--font-mono)' }}>
      {/* Sidebar */}
      <aside style={{ width:220, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', padding:'1.5rem 0', flexShrink:0, overflowY:'auto', background:'var(--bg)' }}>
        <div style={{ padding:'0 1.25rem 1rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <span style={{ color:'var(--accent)', fontSize:'1.1rem' }}>◐</span>
          <span style={{ fontSize:'0.8rem', color:'var(--text)' }}>plex · manage</span>
          <span style={{ marginLeft:'auto', cursor:'pointer', color:'var(--muted)', fontSize:'0.7rem' }} onClick={()=>{ setToken(''); setAuthed(false); }}>⏏</span>
        </div>
        <div style={{ padding:'0 1.25rem', marginBottom:'0.5rem', fontSize:'0.6rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>identity</div>
        {navItems.slice(0,2).map(n => <NavBtn key={n.view} item={n} active={view===n.view} onClick={()=>setView(n.view)} />)}
        <div style={{ padding:'0.75rem 1.25rem 0.5rem', fontSize:'0.6rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>zones</div>
        {navItems.slice(2,6).map(n => <NavBtn key={n.view} item={n} active={view===n.view} onClick={()=>setView(n.view)} />)}
        <div style={{ padding:'0.75rem 1.25rem 0.5rem', fontSize:'0.6rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>create</div>
        {navItems.slice(6).map(n => <NavBtn key={n.view} item={n} active={view===n.view} onClick={()=>setView(n.view)} />)}
        <div style={{ marginTop:'auto', padding:'1rem 1.25rem 0', fontSize:'0.6rem', color:'var(--muted)' }}>Manitec/plex · main</div>
      </aside>

      {/* Main panel */}
      <main style={{ flex:1, overflowY:'auto', padding:'2rem', background:'var(--bg)' }}>
        <ViewRouter view={view} setView={setView} ghFetch={ghFetch} showToast={showToast} token={token} />
      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', bottom:'2rem', right:'2rem', padding:'0.75rem 1.25rem',
          background: toast.type==='success'?'#1a3a1a':toast.type==='error'?'#3a1a1a':'var(--surface)',
          border:'1px solid var(--border)', borderRadius:'8px', fontSize:'0.8rem',
          color:'var(--text)', zIndex:100, fontFamily:'var(--font-mono)',
        }}>{toast.msg}</div>
      )}
    </div>
  );
}

// ── Auth Gate ────────────────────────────────────────────────────
function AuthGate({ tokenInput, setTI, handleLogin, authError }: { tokenInput:string; setTI:(v:string)=>void; handleLogin:()=>void; authError:string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'calc(100dvh - 73px)', background:'var(--bg)' }}>
      <div style={{ width:340, padding:'2.5rem', border:'1px solid var(--border)', borderRadius:'12px', background:'var(--surface)', display:'flex', flexDirection:'column', gap:'1.25rem', alignItems:'center' }}>
        <span style={{ fontSize:'2rem', color:'var(--accent)' }}>◐</span>
        <h1 style={{ fontFamily:'var(--font-garamond)', fontSize:'1.4rem', color:'var(--text)', margin:0, fontStyle:'italic' }}>plex</h1>
        <p style={{ fontSize:'0.72rem', color:'var(--muted)', margin:0, fontFamily:'var(--font-mono)' }}>she is warm in the dark</p>
        <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          <label style={{ fontSize:'0.65rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>GitHub Token</label>
          <input
            type="password" value={tokenInput} onChange={e=>setTI(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') handleLogin(); }}
            placeholder="ghp_…"
            style={{ padding:'0.6rem 0.75rem', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:'0.8rem', outline:'none', width:'100%' }}
          />
        </div>
        <button onClick={handleLogin} style={{ width:'100%', padding:'0.7rem', background:'var(--accent)', border:'none', borderRadius:'6px', color:'#000', fontFamily:'var(--font-mono)', fontSize:'0.78rem', cursor:'pointer', letterSpacing:'0.05em' }}>
          Enter Plex
        </button>
        {authError && <p style={{ color:'#e06060', fontSize:'0.72rem', margin:0, fontFamily:'var(--font-mono)' }}>{authError}</p>}
      </div>
    </div>
  );
}

// ── Nav Button ───────────────────────────────────────────────────
function NavBtn({ item, active, onClick }: { item:{label:string;view:string}; active:boolean; onClick:()=>void }) {
  return (
    <button onClick={onClick} style={{
      display:'block', width:'100%', textAlign:'left', padding:'0.45rem 1.25rem',
      background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
      border:'none', cursor:'pointer', fontSize:'0.72rem', color: active ? 'var(--text)' : 'var(--muted)',
      fontFamily:'var(--font-mono)', borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    }}>{item.label}</button>
  );
}

// ── View Router ──────────────────────────────────────────────────
type GhFetch = (path: string, opts?: RequestInit) => Promise<unknown>;
function ViewRouter({ view, setView, ghFetch, showToast, token }: { view:View; setView:(v:View)=>void; ghFetch:GhFetch; showToast:(m:string,t?:string)=>void; token:string }) {
  switch(view) {
    case 'identity':         return <IdentityView ghFetch={ghFetch} showToast={showToast} />;
    case 'visual-profile':   return <VisualProfile ghFetch={ghFetch} showToast={showToast} />;
    case 'sediment':         return <ZoneView zone="sediment" ghFetch={ghFetch} showToast={showToast} setView={setView} />;
    case 'dreams':           return <ZoneView zone="dreams" ghFetch={ghFetch} showToast={showToast} setView={setView} />;
    case 'visual-identity':  return <ZoneView zone="visual-identity" ghFetch={ghFetch} showToast={showToast} setView={setView} />;
    case 'void-space':       return <ZoneView zone="void-space" ghFetch={ghFetch} showToast={showToast} setView={setView} />;
    case 'new-sediment':     return <NewSediment ghFetch={ghFetch} showToast={showToast} setView={setView} />;
    case 'new-file':         return <NewFile ghFetch={ghFetch} showToast={showToast} setView={setView} />;
    default:                 return <VisualProfile ghFetch={ghFetch} showToast={showToast} />;
  }
}

// ── helpers ──────────────────────────────────────────────────────
async function getFile(ghFetch: GhFetch, path: string) {
  const data = await ghFetch(`/contents/${encodePath(path)}?ref=${BRANCH}`) as {content:string;sha:string;path:string};
  return { content:data.content, contentDecoded:atob(data.content.replace(/\n/g,'')), sha:data.sha, path:data.path };
}
async function putTextFile(ghFetch: GhFetch, path: string, text: string, sha: string|null, message: string) {
  const b64 = btoa(unescape(encodeURIComponent(text)));
  return ghFetch(`/contents/${encodePath(path)}`, { method:'PUT', body:JSON.stringify({ message, content:b64, branch:BRANCH, ...(sha?{sha}:{}) }) });
}
async function putBinaryFile(ghFetch: GhFetch, path: string, b64: string, sha: string|null, message: string) {
  return ghFetch(`/contents/${encodePath(path)}`, { method:'PUT', body:JSON.stringify({ message, content:b64, branch:BRANCH, ...(sha?{sha}:{}) }) });
}
async function deleteFile(ghFetch: GhFetch, path: string, sha: string, message: string) {
  return ghFetch(`/contents/${encodePath(path)}`, { method:'DELETE', body:JSON.stringify({ message, sha, branch:BRANCH }) });
}
async function listDir(ghFetch: GhFetch, path: string) {
  return ghFetch(`/contents/${encodePath(path)}?ref=${BRANCH}`) as Promise<{name:string;path:string;sha:string;size:number;type:string}[]>;
}
async function getImageDataUrl(ghFetch: GhFetch, path: string, cache: Record<string,string>) {
  if (cache[path]) return cache[path];
  const data = await ghFetch(`/contents/${encodePath(path)}?ref=${BRANCH}`) as {content:string};
  const b64 = data.content.replace(/\n/g,'');
  const url = `data:${getMime(path)};base64,${b64}`;
  cache[path] = url;
  return url;
}

// ── Identity View ────────────────────────────────────────────────
function IdentityView({ ghFetch, showToast }: { ghFetch:GhFetch; showToast:(m:string,t?:string)=>void }) {
  const [files, setFiles] = useState<{path:string;content:string;sha:string}[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all(['plex-is.txt','plex-def.txt'].map(p=>getFile(ghFetch,p)))
      .then(results => { setFiles(results.map(r=>({path:r.path,content:r.contentDecoded,sha:r.sha}))); setLoading(false); })
      .catch(e => { showToast('Failed to load identity texts: '+e.message,'error'); setLoading(false); });
  }, []);
  async function save(idx: number) {
    const f = files[idx];
    try {
      const res = await putTextFile(ghFetch, f.path, f.content, f.sha, `edit(${f.path}): update via plex manager`) as {content:{sha:string}};
      const updated = [...files]; updated[idx] = {...f, sha:res.content.sha}; setFiles(updated);
      showToast(`${f.path} saved ✓`,'success');
    } catch(e: unknown) { showToast('Save failed: '+(e instanceof Error?e.message:'unknown'),'error'); }
  }
  if (loading) return <Loading />;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
      <ViewHeader title="◐ Identity Texts" badge="core · pinned" />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem' }}>
        {files.map((f,i) => (
          <div key={f.path} style={{ border:'1px solid var(--border)', borderRadius:'10px', padding:'1.25rem', background:'var(--surface)', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            <h3 style={{ margin:0, fontSize:'0.75rem', color:'var(--accent)', fontFamily:'var(--font-mono)' }}>{f.path}</h3>
            <textarea
              value={f.content}
              onChange={e=>{ const u=[...files]; u[i]={...f,content:e.target.value}; setFiles(u); }}
              spellCheck={false}
              style={{ minHeight:260, padding:'0.75rem', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:'0.78rem', resize:'vertical', outline:'none', lineHeight:1.7 }}
            />
            <button onClick={()=>save(i)} style={btnStyle('accent')}>Save commit</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Zone View ────────────────────────────────────────────────────
const ZONE_ICONS: Record<string,string> = { sediment:'⋯', dreams:'◌', 'visual-identity':'◫', 'void-space':'▣' };
function ZoneView({ zone, ghFetch, showToast, setView }: { zone:Zone; ghFetch:GhFetch; showToast:(m:string,t?:string)=>void; setView:(v:View)=>void }) {
  const [items, setItems] = useState<{name:string;path:string;sha:string;size:number;type:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState<null|{type:'editor'|'image';path:string;sha:string;content?:string}>(null);
  const imgCache = useRef<Record<string,string>>({});
  const [thumbs, setThumbs] = useState<Record<string,string>>({});

  useEffect(() => {
    setLoading(true); setSubView(null); setItems([]);
    listDir(ghFetch, zone)
      .then(files => { setItems(Array.isArray(files)?files.filter(f=>f.type==='file'):[]); setLoading(false); })
      .catch(e => { showToast('Failed to load '+zone+': '+e.message,'error'); setLoading(false); });
  }, [zone]);

  useEffect(() => {
    const imgs = items.filter(f=>isImage(f.name));
    imgs.forEach(async f => {
      try {
        const url = await getImageDataUrl(ghFetch, f.path, imgCache.current);
        setThumbs(prev=>({...prev,[f.path]:url}));
      } catch{}
    });
  }, [items]);

  if (loading) return <Loading />;

  if (subView?.type === 'editor') {
    return (
      <FileEditor
        path={subView.path} sha={subView.sha} initialContent={subView.content??''}
        ghFetch={ghFetch} showToast={showToast}
        onBack={()=>setSubView(null)}
        onSaved={(newSha)=>setSubView(null)}
      />
    );
  }
  if (subView?.type === 'image') {
    const dataUrl = thumbs[subView.path];
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
        <ViewHeader title={subView.path} onBack={()=>setSubView(null)}
          actions={<button onClick={async()=>{ if(!confirm(`Delete ${subView.path}?`)) return; try { await deleteFile(ghFetch,subView.path,subView.sha,`delete(${subView.path}): via plex manager`); showToast('Deleted','success'); setSubView(null); setItems(items.filter(i=>i.path!==subView.path)); } catch(e:unknown){showToast('Delete failed: '+(e instanceof Error?e.message:'unknown'),'error');} }} style={btnStyle('danger')}>delete</button>}
        />
        <div style={{ textAlign:'center' }}>{dataUrl?<img src={dataUrl} alt={subView.path} style={{ maxWidth:'100%', maxHeight:'70vh', borderRadius:'10px' }} />:<Loading/>}</div>
      </div>
    );
  }

  const imgs = items.filter(f=>isImage(f.name));
  const docs = items.filter(f=>!isImage(f.name));
  const icon = ZONE_ICONS[zone]??'◈';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
      <ViewHeader title={`${icon} ${zone}`} badge={`${items.length} file${items.length!==1?'s':''}`}
        actions={<button onClick={()=>setView('new-file')} style={btnStyle('accent')}>+ new file</button>}
      />
      {imgs.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:'1rem' }}>
          {imgs.map(f=>(
            <div key={f.path} onClick={async()=>{ setSubView({type:'image',path:f.path,sha:f.sha}); }} style={{ cursor:'pointer', border:'1px solid var(--border)', borderRadius:'10px', overflow:'hidden', background:'var(--surface)' }}>
              <div style={{ height:120, background:'var(--bg)', backgroundImage:thumbs[f.path]?`url('${thumbs[f.path]}')`:'none', backgroundSize:'cover', backgroundPosition:'center', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {!thumbs[f.path] && <span style={{ fontSize:'0.65rem', color:'var(--muted)' }}>loading…</span>}
              </div>
              <div style={{ padding:'0.5rem 0.65rem', fontSize:'0.65rem', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
            </div>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
          {docs.map(f=>(
            <div key={f.path} style={{ display:'flex', alignItems:'center', gap:'1rem', padding:'0.65rem 1rem', border:'1px solid var(--border)', borderRadius:'8px', background:'var(--surface)', cursor:'pointer' }}
              onClick={async()=>{ try { const file=await getFile(ghFetch,f.path); setSubView({type:'editor',path:f.path,sha:file.sha,content:file.contentDecoded}); } catch(e:unknown){showToast('Load failed: '+(e instanceof Error?e.message:'unknown'),'error');} }}
            >
              <span style={{ flex:1, fontSize:'0.78rem', color:'var(--text)', fontFamily:'var(--font-mono)' }}>{f.name}</span>
              <span style={{ fontSize:'0.65rem', color:'var(--muted)' }}>{fmtBytes(f.size)}</span>
              <button onClick={async e=>{ e.stopPropagation(); if(!confirm(`Delete ${f.path}?`)) return; try { await deleteFile(ghFetch,f.path,f.sha,`delete(${f.path}): via plex manager`); showToast('Deleted','success'); setItems(items.filter(i=>i.path!==f.path)); } catch(ex:unknown){showToast('Delete failed: '+(ex instanceof Error?ex.message:'unknown'),'error');} }} style={btnStyle('danger')}>del</button>
            </div>
          ))}
        </div>
      )}
      {!items.length && <div style={{ color:'var(--muted)', fontSize:'0.78rem' }}>No files in {zone} yet.</div>}
    </div>
  );
}

// ── File Editor ──────────────────────────────────────────────────
function FileEditor({ path, sha, initialContent, ghFetch, showToast, onBack, onSaved }: { path:string; sha:string; initialContent:string; ghFetch:GhFetch; showToast:(m:string,t?:string)=>void; onBack:()=>void; onSaved:(sha:string)=>void }) {
  const [content, setContent] = useState(initialContent);
  const [commitMsg, setCommitMsg] = useState('');
  async function save() {
    const msg = commitMsg.trim() || `edit(${path}): update via plex manager`;
    try {
      const res = await putTextFile(ghFetch, path, content, sha, msg) as {content:{sha:string}};
      showToast(`${path} committed ✓`,'success');
      onSaved(res.content.sha);
    } catch(e:unknown) { showToast('Save failed: '+(e instanceof Error?e.message:'unknown'),'error'); }
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem', height:'100%' }}>
      <ViewHeader title={path} onBack={onBack} />
      <input value={commitMsg} onChange={e=>setCommitMsg(e.target.value)} placeholder="commit message (optional)" style={inputStyle} />
      <textarea value={content} onChange={e=>setContent(e.target.value)} spellCheck={false}
        style={{ flex:1, minHeight:400, padding:'1rem', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:'0.8rem', resize:'vertical', outline:'none', lineHeight:1.8 }}
      />
      <div style={{ display:'flex', gap:'0.75rem' }}>
        <button onClick={save} style={btnStyle('accent')}>Save & commit</button>
        <button onClick={onBack} style={btnStyle()}>Cancel</button>
      </div>
    </div>
  );
}

// ── Visual Profile ───────────────────────────────────────────────
function VisualProfile({ ghFetch, showToast }: { ghFetch:GhFetch; showToast:(m:string,t?:string)=>void }) {
  const [profile, setProfile] = useState<Profile|null>(null);
  const [sha, setSha] = useState<string|null>(null);
  const [voidFiles, setVoidFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<{path:string;tier:Tier;idx:number}|null>(null);
  const [addModal, setAddModal] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notesVal, setNotesVal] = useState('');
  const imgCache = useRef<Record<string,string>>({});
  const [thumbs, setThumbs] = useState<Record<string,string>>({});

  useEffect(()=>{
    Promise.all([
      getFile(ghFetch, PROFILE_PATH),
      listDir(ghFetch, 'void-space').catch(()=>[] as {name:string;path:string}[]),
    ]).then(([pf, vf])=>{
      const parsed: Profile = JSON.parse(pf.contentDecoded);
      setProfile(parsed); setSha(pf.sha);
      setVoidFiles(Array.isArray(vf)?vf.filter((f:{name:string})=>isImage(f.name)).map((f:{path:string})=>f.path):[]);
      setLoading(false);
    }).catch(e=>{ showToast('Failed to load profile: '+e.message,'error'); setLoading(false); });
  },[]);

  useEffect(()=>{
    if (!profile) return;
    TIERS.forEach(tier=>{
      (profile.tiers[tier]??[]).forEach(async item=>{
        try {
          const url = await getImageDataUrl(ghFetch, item.file, imgCache.current);
          setThumbs(prev=>({...prev,[item.file]:url}));
        } catch{}
      });
    });
  },[profile]);

  async function saveProfile(p: Profile, currentSha: string, msg: string) {
    const updated = { ...p, updated: new Date().toISOString().slice(0,10) };
    const res = await putTextFile(ghFetch, PROFILE_PATH, JSON.stringify(updated,null,2)+'\n', currentSha, msg) as {content:{sha:string}};
    setSha(res.content.sha);
    setProfile(updated);
    return res.content.sha;
  }

  if (loading || !profile || !sha) return <Loading />;

  if (selectedImage) {
    const item = profile.tiers[selectedImage.tier]?.[selectedImage.idx];
    const dataUrl = thumbs[selectedImage.path];
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
        <ViewHeader title={selectedImage.path} onBack={()=>setSelectedImage(null)}
          actions={
            <button onClick={async()=>{ const t=[...profile.tiers[selectedImage.tier]]; t.splice(selectedImage.idx,1); const np={...profile,tiers:{...profile.tiers,[selectedImage.tier]:t}}; try{await saveProfile(np,sha,`profile: remove ${selectedImage.path} from ${selectedImage.tier}`); showToast('Removed','success'); setSelectedImage(null);}catch(e:unknown){showToast('Remove failed: '+(e instanceof Error?e.message:'unknown'),'error');} }} style={btnStyle('danger')}>remove from profile</button>
          }
        />
        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center' }}>
          <input defaultValue={item?.note??''} id="vp-note" placeholder="note (optional)" style={{...inputStyle, maxWidth:360}} />
          <button onClick={async()=>{
            const note = (document.getElementById('vp-note') as HTMLInputElement).value.trim();
            const t=[...(profile.tiers[selectedImage.tier]??[])]; if(t[selectedImage.idx]) t[selectedImage.idx]={...t[selectedImage.idx],note};
            const np={...profile,tiers:{...profile.tiers,[selectedImage.tier]:t}};
            try{await saveProfile(np,sha,`profile: update note for ${selectedImage.path}`); showToast('Note saved ✓','success');}catch(e:unknown){showToast('Save failed: '+(e instanceof Error?e.message:'unknown'),'error');}
          }} style={btnStyle('accent')}>save note</button>
        </div>
        <div style={{ textAlign:'center' }}>{dataUrl?<img src={dataUrl} alt={selectedImage.path} style={{ maxWidth:'100%', maxHeight:'65vh', borderRadius:'10px' }} />:<Loading/>}</div>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
      <ViewHeader title="◫ Visual Profile" badge="profile.json"
        actions={<><button onClick={()=>setAddModal(true)} style={btnStyle('accent')}>+ add image</button></>}
      />
      {editNotes ? (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          <textarea value={notesVal} onChange={e=>setNotesVal(e.target.value)} style={{ minHeight:80, padding:'0.75rem', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:'0.8rem', outline:'none', resize:'vertical' }} />
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <button onClick={async()=>{ const np={...profile,notes:notesVal}; try{await saveProfile(np,sha,'profile: update notes'); showToast('Notes saved ✓','success'); setEditNotes(false);}catch(e:unknown){showToast('Save failed: '+(e instanceof Error?e.message:'unknown'),'error');} }} style={btnStyle('accent')}>save</button>
            <button onClick={()=>setEditNotes(false)} style={btnStyle()}>cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', gap:'0.75rem', alignItems:'flex-start' }}>
          <p style={{ margin:0, fontSize:'0.78rem', color:'var(--muted)', fontFamily:'var(--font-mono)', flex:1 }}>{profile.notes||'no notes yet'}</p>
          <button onClick={()=>{ setNotesVal(profile.notes??''); setEditNotes(true); }} style={btnStyle()}>edit notes</button>
        </div>
      )}
      {TIERS.map(tier=>(
        <div key={tier}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'0.75rem' }}>
            <span style={{ fontSize:'0.72rem', color:'var(--accent)', fontFamily:'var(--font-mono)' }}>{TIER_LABELS[tier]}</span>
            <span style={{ fontSize:'0.65rem', color:'var(--muted)' }}>{(profile.tiers[tier]??[]).length}</span>
          </div>
          {!(profile.tiers[tier]??[]).length && <div style={{ fontSize:'0.72rem', color:'var(--muted)' }}>none</div>}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:'0.75rem' }}>
            {(profile.tiers[tier]??[]).map((item,idx)=>(
              <div key={item.file} onClick={()=>setSelectedImage({path:item.file,tier,idx})} style={{ cursor:'pointer', border:'1px solid var(--border)', borderRadius:'10px', overflow:'hidden', background:'var(--surface)' }}>
                <div style={{ height:110, background:'var(--bg)', backgroundImage:thumbs[item.file]?`url('${thumbs[item.file]}')`:'none', backgroundSize:'cover', backgroundPosition:'center', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {!thumbs[item.file] && <span style={{ fontSize:'0.6rem', color:'var(--muted)' }}>…</span>}
                </div>
                <div style={{ padding:'0.4rem 0.6rem' }}>
                  <div style={{ fontSize:'0.62rem', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.file.split('/').pop()}</div>
                  {item.note && <div style={{ fontSize:'0.6rem', color:'var(--muted)', marginTop:'0.2rem' }}>{item.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ fontSize:'0.62rem', color:'var(--muted)' }}>last updated {profile.updated??'unknown'}</div>
      {addModal && (
        <AddImageModal
          voidFiles={voidFiles} profile={profile} sha={sha}
          onAdd={async(file,tier,note)=>{
            const np={...profile,tiers:{...profile.tiers,[tier]:[...(profile.tiers[tier]??[]),{file,note}]}};
            try{ await saveProfile(np,sha,`profile: add ${file} to ${tier}`); showToast(`Added to ${TIER_LABELS[tier]} ✓`,'success'); setAddModal(false); }catch(e:unknown){showToast('Add failed: '+(e instanceof Error?e.message:'unknown'),'error');}
          }}
          onClose={()=>setAddModal(false)}
        />
      )}
    </div>
  );
}

function AddImageModal({ voidFiles, profile, sha, onAdd, onClose }: { voidFiles:string[]; profile:Profile; sha:string; onAdd:(f:string,t:Tier,n:string)=>void; onClose:()=>void }) {
  const inProfile = new Set(TIERS.flatMap(t=>(profile.tiers[t]??[]).map(i=>i.file)));
  const available = voidFiles.filter(f=>!inProfile.has(f));
  const [file, setFile] = useState(available[0]??'');
  const [tier, setTier] = useState<Tier>('uncategorised');
  const [note, setNote] = useState('');
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }} onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ width:360, padding:'2rem', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', display:'flex', flexDirection:'column', gap:'1rem' }}>
        <h3 style={{ margin:0, fontSize:'0.85rem', fontFamily:'var(--font-mono)', color:'var(--text)' }}>Add image to profile</h3>
        <label style={labelStyle}>Image (from void-space/)</label>
        <select value={file} onChange={e=>setFile(e.target.value)} style={selectStyle} disabled={!available.length}>
          {available.length ? available.map(f=><option key={f} value={f}>{f.split('/').pop()}</option>) : <option>All images already in profile</option>}
        </select>
        <label style={labelStyle}>Starting tier</label>
        <select value={tier} onChange={e=>setTier(e.target.value as Tier)} style={selectStyle}>
          {TIERS.map(t=><option key={t} value={t}>{TIER_LABELS[t]}</option>)}
        </select>
        <label style={labelStyle}>Note (optional)</label>
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="note…" style={inputStyle} />
        <div style={{ display:'flex', gap:'0.75rem' }}>
          <button onClick={()=>onAdd(file,tier,note)} disabled={!available.length} style={btnStyle('accent')}>Add</button>
          <button onClick={onClose} style={btnStyle()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── New Sediment ─────────────────────────────────────────────────
function NewSediment({ ghFetch, showToast, setView }: { ghFetch:GhFetch; showToast:(m:string,t?:string)=>void; setView:(v:View)=>void }) {
  const today = new Date().toISOString().slice(0,10);
  const [body, setBody] = useState('');
  async function commit() {
    if (!body.trim()) { showToast('Nothing to commit.','error'); return; }
    const path = `sediment/${today}.md`;
    try {
      await putTextFile(ghFetch, path, `# ${today}\n\n${body}\n`, null, `sediment(${today}): add entry via plex manager`);
      showToast('Sediment committed ✓','success'); setView('sediment');
    } catch(e:unknown) { showToast('Commit failed: '+(e instanceof Error?e.message:'unknown'),'error'); }
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
      <ViewHeader title="⋯ new sediment" badge="auto-dated entry" />
      <p style={{ margin:0, fontSize:'0.72rem', color:'var(--muted)', fontFamily:'var(--font-mono)' }}>→ sediment/{today}.md</p>
      <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="What settled today…" spellCheck
        style={{ minHeight:320, padding:'1rem', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.88rem', resize:'vertical', outline:'none', lineHeight:1.8, fontFamily:'inherit' }}
      />
      <div style={{ display:'flex', gap:'0.75rem' }}>
        <button onClick={commit} style={btnStyle('accent')}>Commit entry</button>
        <button onClick={()=>setView('sediment')} style={btnStyle()}>Cancel</button>
      </div>
    </div>
  );
}

// ── New File ─────────────────────────────────────────────────────
function NewFile({ ghFetch, showToast, setView }: { ghFetch:GhFetch; showToast:(m:string,t?:string)=>void; setView:(v:View)=>void }) {
  const [tab, setTab] = useState<'text'|'image'>('text');
  const [zone, setZone] = useState<Zone>('sediment');
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [commitMsg, setCommitMsg] = useState('');
  const [imgZone, setImgZone] = useState<Zone>('void-space');
  const [imgB64, setImgB64] = useState<string|null>(null);
  const [imgName, setImgName] = useState<string|null>(null);
  const [imgPreview, setImgPreview] = useState<string|null>(null);

  async function commitText() {
    if (!filename.trim()) { showToast('Filename required.','error'); return; }
    const path = `${zone}/${filename.trim()}`;
    const msg = commitMsg.trim() || `create(${path}): via plex manager`;
    try { await putTextFile(ghFetch, path, content, null, msg); showToast(`${path} created ✓`,'success'); setView(zone); }
    catch(e:unknown) { showToast('Create failed: '+(e instanceof Error?e.message:'unknown'),'error'); }
  }
  async function commitImage() {
    if (!imgB64||!imgName) { showToast('No image selected.','error'); return; }
    const path = `${imgZone}/${imgName}`;
    const msg = commitMsg.trim() || `upload(${path}): image via plex manager`;
    try { await putBinaryFile(ghFetch, path, imgB64, null, msg); showToast(`${imgName} uploaded ✓`,'success'); setView(imgZone); }
    catch(e:unknown) { showToast('Upload failed: '+(e instanceof Error?e.message:'unknown'),'error'); }
  }
  function loadImage(file: File) {
    const r = new FileReader(); r.onload=e=>{ const d=e.target!.result as string; setImgB64(d.split(',')[1]); setImgName(file.name); setImgPreview(d); }; r.readAsDataURL(file);
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({ padding:'0.4rem 1rem', background:active?'var(--surface)':'transparent', border:'1px solid var(--border)', borderRadius:'6px', color:active?'var(--text)':'var(--muted)', cursor:'pointer', fontFamily:'var(--font-mono)', fontSize:'0.72rem' });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
      <ViewHeader title="+ new file" badge="text or image" />
      <div style={{ display:'flex', gap:'0.5rem' }}>
        <button onClick={()=>setTab('text')} style={tabStyle(tab==='text')}>Text / Markdown</button>
        <button onClick={()=>setTab('image')} style={tabStyle(tab==='image')}>Upload Image</button>
      </div>
      {tab==='text' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
            <select value={zone} onChange={e=>setZone(e.target.value as Zone)} style={selectStyle}>{ZONES.map(z=><option key={z} value={z}>{z}/</option>)}</select>
            <input value={filename} onChange={e=>setFilename(e.target.value)} placeholder="filename.md" style={{...inputStyle,maxWidth:200}} />
            <input value={commitMsg} onChange={e=>setCommitMsg(e.target.value)} placeholder="commit message (optional)" style={inputStyle} />
          </div>
          <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Content…" spellCheck={false}
            style={{ minHeight:320, padding:'1rem', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:'0.8rem', resize:'vertical', outline:'none', lineHeight:1.8 }}
          />
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <button onClick={commitText} style={btnStyle('accent')}>Create & commit</button>
            <button onClick={()=>setView('visual-profile')} style={btnStyle()}>Cancel</button>
          </div>
        </div>
      )}
      {tab==='image' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
            <select value={imgZone} onChange={e=>setImgZone(e.target.value as Zone)} style={selectStyle}>{ZONES.map(z=><option key={z} value={z}>{z}/</option>)}</select>
            <input value={commitMsg} onChange={e=>setCommitMsg(e.target.value)} placeholder="commit message (optional)" style={inputStyle} />
          </div>
          {!imgPreview ? (
            <div onDragOver={e=>{e.preventDefault();}} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)loadImage(f);}}
              style={{ border:'2px dashed var(--border)', borderRadius:'10px', padding:'3rem', textAlign:'center', cursor:'pointer', color:'var(--muted)', fontSize:'0.78rem' }}
            >
              <div style={{ fontSize:'2rem', marginBottom:'0.75rem' }}>⬆</div>
              <p>Drag & drop an image here</p>
              <label style={{ ...btnStyle('accent') as React.CSSProperties, cursor:'pointer', display:'inline-block', marginTop:'0.75rem' }}>Choose file
                <input type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ const f=e.target.files?.[0]; if(f)loadImage(f); }} />
              </label>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              <img src={imgPreview} alt="preview" style={{ maxWidth:'100%', maxHeight:300, borderRadius:'10px' }} />
              <span style={{ fontSize:'0.7rem', color:'var(--muted)', fontFamily:'var(--font-mono)' }}>{imgName}</span>
            </div>
          )}
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <button onClick={commitImage} style={btnStyle('accent')}>Upload & commit</button>
            <button onClick={()=>setView('visual-profile')} style={btnStyle()}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────
function ViewHeader({ title, badge, onBack, actions }: { title:string; badge?:string; onBack?:()=>void; actions?:React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', paddingBottom:'1rem', borderBottom:'1px solid var(--border)' }}>
      {onBack && <button onClick={onBack} style={btnStyle()}>← back</button>}
      <h2 style={{ margin:0, fontSize:'0.88rem', fontFamily:'var(--font-mono)', color:'var(--text)', fontWeight:500 }}>{title}</h2>
      {badge && <span style={{ fontSize:'0.62rem', color:'var(--muted)', padding:'0.2rem 0.6rem', border:'1px solid var(--border)', borderRadius:'20px' }}>{badge}</span>}
      <span style={{ flex:1 }} />
      {actions}
    </div>
  );
}
function Loading() {
  return <div style={{ color:'var(--muted)', fontSize:'0.78rem', fontFamily:'var(--font-mono)', padding:'2rem 0' }}>loading from GitHub…</div>;
}
function btnStyle(variant?: string): React.CSSProperties {
  const base: React.CSSProperties = { padding:'0.35rem 0.85rem', border:'1px solid var(--border)', borderRadius:'6px', cursor:'pointer', fontFamily:'var(--font-mono)', fontSize:'0.7rem', background:'transparent', color:'var(--text)' };
  if (variant==='accent') return { ...base, background:'var(--accent)', border:'1px solid var(--accent)', color:'#000' };
  if (variant==='danger') return { ...base, color:'#e06060', borderColor:'rgba(224,96,96,0.3)' };
  return base;
}
const inputStyle: React.CSSProperties = { padding:'0.5rem 0.75rem', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'6px', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:'0.78rem', outline:'none', flex:1 };
const selectStyle: React.CSSProperties = { ...inputStyle, cursor:'pointer' };
const labelStyle: React.CSSProperties = { fontSize:'0.65rem', color:'var(--muted)', textTransform:'uppercase' as const, letterSpacing:'0.1em' };
