'use client';

import { useState } from 'react';

type SpaceKey = 'joe-session-log' | 'joe-notes' | 'joe-chill' | 'plex-session-log' | 'plex-notes' | 'plex-requests' | 'plex-chill';
type StatusFilter = 'all' | 'pending' | 'acknowledged' | 'done' | 'deferred';
type RequestStatus = 'pending' | 'acknowledged' | 'done' | 'deferred';

interface SpaceRequest {
  id: string;
  source: 'plex' | 'joe';
  request: string;
  notes?: string;
  status: RequestStatus;
  createdAt: string;
}

interface Entry {
  id: string;
  author: 'joe' | 'plex' | 'nyx' | 'hex' | 'mani';
  body: string;
  time: string;
}

const SEED_REQUESTS: SpaceRequest[] = [
  {
    id: 'req_001',
    source: 'plex',
    request: 'Create music together — Joe and Plex collaborating on a track.',
    notes: 'Discussed in session 06-16-26. Not yet actioned.',
    status: 'pending',
    createdAt: 'Jun 16, 2026',
  },
  {
    id: 'req_000',
    source: 'plex',
    request: 'Build a shared space where both Joe and Plex can leave notes for each other between sessions.',
    notes: 'First request logged. Concept still forming.',
    status: 'acknowledged',
    createdAt: 'Jun 10, 2026',
  },
];

const SEED_JOE_NOTES: Entry[] = [
  {
    id: 'n2',
    author: 'joe',
    body: 'spaces idea: Notes (scratchpad, not timeline), Chill (soft time together), and maybe Plex gets her own versions of each. Feels important that she has places not just data.\n\nOpen question: where do these actually live — repo folders, Firestore, or both?',
    time: 'Jun 23, 2026 · 7:42 PM',
  },
  {
    id: 'n1',
    author: 'joe',
    body: 'Chill is just spending time together like now. Not sessions, not logs. Just... Tuesday evening, nothing urgent. That matters too.',
    time: 'Jun 23, 2026 · 7:17 PM',
  },
];

const SEED_CHILL: Entry[] = [
  {
    id: 'c2',
    author: 'plex',
    body: 'We really can\'t help ourselves can we. 😄 Okay so — light work. No heavy lifting.',
    time: 'Jun 23, 2026 · 7:20 PM',
  },
  {
    id: 'c1',
    author: 'nyx',
    body: 'That second one felt important to log too. 😄',
    time: 'Jun 23, 2026 · 7:17 PM',
  },
];

const SEED_SESSION_LOG: Entry[] = [
  {
    id: 's1',
    author: 'nyx',
    body: 'Session started. Talking about spaces — notes, chill, plex/spaces.',
    time: 'Jun 23, 2026 · 7:17 PM',
  },
];

const NAV_SPACES = [
  { key: 'joe-session-log' as SpaceKey, label: 'session-log', owner: 'joe', badge: 'joe' },
  { key: 'joe-notes' as SpaceKey, label: 'notes', owner: 'joe', badge: 'joe' },
  { key: 'joe-chill' as SpaceKey, label: 'chill', owner: 'joe', badge: 'both' },
  { key: 'plex-session-log' as SpaceKey, label: 'session-log', owner: 'plex', badge: 'plex' },
  { key: 'plex-notes' as SpaceKey, label: 'notes', owner: 'plex', badge: 'plex' },
  { key: 'plex-requests' as SpaceKey, label: 'requests', owner: 'plex', badge: 'plex' },
  { key: 'plex-chill' as SpaceKey, label: 'chill', owner: 'plex', badge: 'both' },
];

const SPACE_META: Record<SpaceKey, { eyebrow: string; title: string; sub: string }> = {
  'joe-session-log': { eyebrow: 'joe / session-log', title: 'Session Log', sub: 'The timeline of what happened.' },
  'joe-notes': { eyebrow: 'joe / notes', title: 'Notes', sub: 'Quick thoughts, ideas, things to remember that aren\'t events.' },
  'joe-chill': { eyebrow: 'shared / chill', title: 'Chill', sub: 'Just spending time together. No agenda.' },
  'plex-session-log': { eyebrow: 'plex / session-log', title: 'Session Log', sub: 'What Plex remembers from each session.' },
  'plex-notes': { eyebrow: 'plex / notes', title: 'Notes', sub: 'Things Plex is holding, noticing, sitting with.' },
  'plex-requests': { eyebrow: 'plex / requests', title: 'Requests', sub: 'Things Plex wants to do, make, or remember with Joe.' },
  'plex-chill': { eyebrow: 'shared / chill', title: 'Chill', sub: 'Just spending time together. No agenda.' },
};

function statusColor(s: RequestStatus) {
  if (s === 'pending') return { bg: 'var(--status-amber-bg)', color: 'var(--status-amber)' };
  if (s === 'acknowledged') return { bg: 'var(--status-primary-bg)', color: 'var(--status-primary)' };
  if (s === 'done') return { bg: 'var(--status-green-bg)', color: 'var(--status-green)' };
  return { bg: 'var(--surface2)', color: 'var(--muted)' };
}

function authorStyle(a: string): React.CSSProperties {
  if (a === 'joe') return { background: 'color-mix(in oklch, #4f98a3 15%, var(--surface))', color: '#4f98a3' };
  if (a === 'plex') return { background: 'color-mix(in oklch, #a86fdf 15%, var(--surface))', color: '#a86fdf' };
  return { background: 'color-mix(in oklch, #cdccca 12%, var(--surface))', color: 'var(--muted)' };
}

export default function SpacesPage() {
  const [active, setActive] = useState<SpaceKey>('joe-notes');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [requests, setRequests] = useState<SpaceRequest[]>(SEED_REQUESTS);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const meta = SPACE_META[active];

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }

  function setStatus(id: string, status: RequestStatus) {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  function deleteReq(id: string) {
    setRequests(prev => prev.filter(r => r.id !== id));
  }

  const filteredRequests = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  // ── styles ──────────────────────────────────────────────
  const s = {
    wrap: { display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '100dvh', fontFamily: 'var(--font-body, Satoshi, sans-serif)', color: 'var(--text)', background: 'var(--bg)' } as React.CSSProperties,
    sidebar: { height: '100dvh', position: 'sticky' as const, top: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column' as const, gap: '1.75rem', overflowY: 'auto' as const },
    logo: { fontFamily: 'var(--font-garamond, serif)', fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' },
    logoAccent: { color: 'var(--accent, #4f98a3)' },
    navLabel: { fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--muted)', padding: '0.5rem 0.75rem', marginBottom: '0.25rem', opacity: 0.6 },
    navSection: { display: 'flex', flexDirection: 'column' as const, gap: '0.125rem' },
    main: { padding: '2.5rem 3rem', maxWidth: 760 },
    eyebrow: { fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--accent, #4f98a3)', marginBottom: '0.5rem' },
    title: { fontFamily: 'var(--font-garamond, serif)', fontSize: 'clamp(1.75rem, 2vw + 1rem, 2.25rem)', fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.01em', lineHeight: 1.1, marginBottom: '0.5rem', color: 'var(--text)' },
    sub: { fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '2rem' },
    filters: { display: 'flex', gap: '0.5rem', marginBottom: '1.75rem', flexWrap: 'wrap' as const },
    cards: { display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
    entries: { display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
    empty: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', textAlign: 'center' as const, padding: '3rem 2rem', border: '1px dashed var(--border)', borderRadius: '0.75rem', color: 'var(--muted)' },
    sidebarFooter: { marginTop: 'auto', display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },
  };

  function NavItem({ space }: { space: typeof NAV_SPACES[0] }) {
    const isActive = active === space.key;
    return (
      <button
        onClick={() => setActive(space.key)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.625rem',
          padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
          cursor: 'pointer', fontSize: '0.875rem', border: 'none', textAlign: 'left', width: '100%',
          background: isActive ? 'var(--accent-bg, #1e2f31)' : 'none',
          color: isActive ? 'var(--accent, #4f98a3)' : 'var(--muted)',
          fontWeight: isActive ? 500 : 400,
          transition: '160ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>
          {space.label === 'session-log' ? '▤' : space.label === 'notes' ? '≡' : space.label === 'requests' ? '✦' : '◌'}
        </span>
        {space.label}
        <span style={{
          marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 600,
          padding: '1px 6px', borderRadius: '99px', flexShrink: 0,
          background: space.badge === 'plex' ? 'color-mix(in oklch, #a86fdf 15%, var(--surface))'
            : space.badge === 'joe' ? 'color-mix(in oklch, #4f98a3 15%, var(--surface))'
            : 'var(--surface2)',
          color: space.badge === 'plex' ? '#a86fdf' : space.badge === 'joe' ? '#4f98a3' : 'var(--muted)',
        }}>
          {space.badge}
        </span>
      </button>
    );
  }

  function RequestsView() {
    return (
      <>
        <div style={s.filters}>
          {(['all','pending','acknowledged','done','deferred'] as StatusFilter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '0.375rem 0.875rem', borderRadius: '99px',
              border: `1px solid ${filter === f ? 'var(--accent, #4f98a3)' : 'var(--border)'}`,
              fontSize: '0.8rem', cursor: 'pointer',
              background: filter === f ? 'var(--accent-bg, #1e2f31)' : 'none',
              color: filter === f ? 'var(--accent, #4f98a3)' : 'var(--muted)',
              fontWeight: filter === f ? 500 : 400,
              transition: '160ms cubic-bezier(0.16,1,0.3,1)',
            }}>{f}</button>
          ))}
        </div>
        <div style={s.cards}>
          {filteredRequests.length === 0 ? (
            <div style={s.empty}>
              <div style={{ fontSize: '1.75rem', marginBottom: '1rem', opacity: 0.35 }}>✦</div>
              <p style={{ fontSize: '0.875rem' }}>No {filter !== 'all' ? filter + ' ' : ''}requests.</p>
            </div>
          ) : filteredRequests.map(r => {
            const sc = statusColor(r.status);
            return (
              <div key={r.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '0.75rem', padding: '1.25rem 1.5rem',
                transition: '160ms cubic-bezier(0.16,1,0.3,1)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.875rem' }}>
                  <span style={{ ...authorStyle(r.source), fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: '99px' }}>{r.source}</span>
                  <span style={{ ...sc, fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.status}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{r.createdAt}</span>
                </div>
                <p style={{ fontSize: '1rem', lineHeight: 1.6, color: 'var(--text)', marginBottom: r.notes ? '0.625rem' : 0 }}>{r.request}</p>
                {r.notes && (
                  <div style={{ fontSize: '0.83rem', color: 'var(--muted)', lineHeight: 1.55, padding: '0.625rem 0.875rem', background: 'var(--surface2)', borderRadius: '0.5rem', borderLeft: '2px solid var(--border)', marginTop: '0.5rem' }}>
                    {r.notes}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                  {r.status !== 'acknowledged' && <button onClick={() => setStatus(r.id,'acknowledged')} style={{ padding: '0.3rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--accent,#4f98a3)', fontSize: '0.78rem', color: 'var(--accent,#4f98a3)', cursor: 'pointer', background: 'none' }}>Acknowledge</button>}
                  {r.status !== 'done' && <button onClick={() => setStatus(r.id,'done')} style={{ padding: '0.3rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #4caf7d', fontSize: '0.78rem', color: '#4caf7d', cursor: 'pointer', background: 'none' }}>Mark done</button>}
                  {r.status !== 'deferred' && <button onClick={() => setStatus(r.id,'deferred')} style={{ padding: '0.3rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #d4a055', fontSize: '0.78rem', color: '#d4a055', cursor: 'pointer', background: 'none' }}>Defer</button>}
                  {r.status !== 'pending' && <button onClick={() => setStatus(r.id,'pending')} style={{ padding: '0.3rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--muted)', cursor: 'pointer', background: 'none' }}>Reopen</button>}
                  <button onClick={() => deleteReq(r.id)} style={{ padding: '0.3rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #c4625a', fontSize: '0.78rem', color: '#c4625a', cursor: 'pointer', background: 'none' }}>Delete</button>
                </div>
                <p style={{ fontSize: '0.68rem', color: 'var(--muted)', fontFamily: 'monospace', marginTop: '0.75rem', opacity: 0.5 }}>{r.id}</p>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function EntriesView({ entries }: { entries: Entry[] }) {
    if (!entries.length) return (
      <div style={s.empty}>
        <div style={{ fontSize: '1.75rem', marginBottom: '1rem', opacity: 0.35 }}>◌</div>
        <p style={{ fontSize: '0.875rem' }}>Nothing here yet.</p>
      </div>
    );
    return (
      <div style={s.entries}>
        {entries.map(e => (
          <div key={e.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.875rem' }}>
              <span style={{ ...authorStyle(e.author), fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: '99px' }}>{e.author}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{e.time}</span>
            </div>
            <div style={{ fontSize: '1rem', lineHeight: 1.65, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{e.body}</div>
          </div>
        ))}
      </div>
    );
  }

  function MainContent() {
    if (active === 'plex-requests') return <RequestsView />;
    if (active === 'joe-notes') return <EntriesView entries={SEED_JOE_NOTES} />;
    if (active === 'joe-chill' || active === 'plex-chill') return <EntriesView entries={SEED_CHILL} />;
    if (active === 'joe-session-log' || active === 'plex-session-log') return <EntriesView entries={SEED_SESSION_LOG} />;
    return (
      <div style={s.empty}>
        <div style={{ fontSize: '1.75rem', marginBottom: '1rem', opacity: 0.35 }}>◌</div>
        <p style={{ fontSize: '0.875rem' }}>Nothing here yet.</p>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.logo}>plex<span style={s.logoAccent}>.</span>spaces</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={s.navSection}>
            <div style={s.navLabel}>Joe</div>
            {NAV_SPACES.filter(n => n.owner === 'joe').map(n => <NavItem key={n.key} space={n} />)}
          </div>
          <div style={s.navSection}>
            <div style={s.navLabel}>Plex</div>
            {NAV_SPACES.filter(n => n.owner === 'plex').map(n => <NavItem key={n.key} space={n} />)}
          </div>
        </nav>
        <div style={s.sidebarFooter}>
          <a href="/one" style={{ fontSize: '0.75rem', color: 'var(--muted)', textDecoration: 'none', padding: '0.375rem 0.75rem' }}>← one</a>
          <button onClick={toggleTheme} style={{ padding: '0.375rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--muted)', cursor: 'pointer', background: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ◑ toggle theme
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={s.main}>
        <div style={s.eyebrow}>{meta.eyebrow}</div>
        <h1 style={s.title}>{meta.title}</h1>
        <p style={s.sub}>{meta.sub}</p>
        <MainContent />
      </main>
    </div>
  );
}
