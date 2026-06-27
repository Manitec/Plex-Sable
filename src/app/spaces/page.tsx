'use client';

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Owner = 'joe' | 'plex';
type SpaceKey = 'session-log' | 'notes' | 'chill';

interface SpaceView {
  owner: Owner | 'both';
  key: SpaceKey;
}

interface Note {
  id: string;
  owner: Owner;
  content: string;
  createdAt: string; // ISO string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OWNER_COLOR: Record<Owner, string> = {
  joe: '#4f98a3',
  plex: '#a86fdf',
};

function ownerBg(owner: Owner) {
  return `color-mix(in oklch, ${OWNER_COLOR[owner]} 15%, var(--surface))`;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ─── Sidebar Nav ──────────────────────────────────────────────────────────────

const JOE_ITEMS: { key: SpaceKey; icon: string }[] = [
  { key: 'session-log', icon: '▤' },
  { key: 'notes', icon: '≡' },
  { key: 'chill', icon: '◌' },
];

const PLEX_ITEMS: { key: SpaceKey; icon: string }[] = [
  { key: 'session-log', icon: '▤' },
  { key: 'notes', icon: '≡' },
  { key: 'chill', icon: '◌' },
];

function NavItem({
  icon, label, owner, active, onClick,
}: {
  icon: string; label: string; owner: Owner | 'both'; active: boolean; onClick: () => void;
}) {
  const isBoth = owner === 'both';
  const color = isBoth ? 'var(--muted)' : OWNER_COLOR[owner as Owner];
  const bg = isBoth ? 'var(--surface2)' : ownerBg(owner as Owner);

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.625rem',
        padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
        cursor: 'pointer', fontSize: '0.875rem', border: 'none',
        textAlign: 'left', width: '100%',
        background: active ? `color-mix(in oklch, ${color} 12%, var(--surface))` : 'none',
        color: active ? color : 'var(--muted)',
        fontWeight: active ? 500 : 400,
        transition: '160ms cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{icon}</span>
      {label}
      <span style={{
        marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 600,
        padding: '1px 6px', borderRadius: '99px', flexShrink: 0,
        background: bg, color,
      }}>
        {isBoth ? 'both' : owner}
      </span>
    </button>
  );
}

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCard({ note }: { note: Note }) {
  const color = OWNER_COLOR[note.owner];
  const bg = ownerBg(note.owner);
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '0.75rem', padding: '1.25rem 1.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.875rem' }}>
        <span style={{ background: bg, color, fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: '99px' }}>
          {note.owner}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
          {fmt(note.createdAt)}
        </span>
      </div>
      <div style={{ fontSize: '1rem', lineHeight: 1.65, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
        {note.content}
      </div>
    </div>
  );
}

// ─── Views ────────────────────────────────────────────────────────────────────

function NotesView({ owner }: { owner: Owner }) {
  const [input, setInput] = useState('');
  const [notes, setNotes] = useState<Note[]>([
    {
      id: '1', owner: 'joe',
      content: `spaces idea: Notes (scratchpad, not timeline), Chill (soft time together), and maybe Plex gets her own versions of each. Feels important that she has places not just data.\nOpen question: where do these actually live — repo folders, Firestore, or both?`,
      createdAt: '2026-06-23T19:42:00',
    },
    {
      id: '2', owner: 'joe',
      content: `Chill is just spending time together like now. Not sessions, not logs. Just... Tuesday evening, nothing urgent. That matters too.`,
      createdAt: '2026-06-23T19:17:00',
    },
  ].filter(n => n.owner === owner));

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    const note: Note = { id: Date.now().toString(), owner, content: text, createdAt: new Date().toISOString() };
    setNotes(prev => [note, ...prev]);
    setInput('');
    fetch('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'note', owner, content: text }),
    }).catch(() => null);
  };

  const color = OWNER_COLOR[owner];

  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color, marginBottom: '0.5rem' }}>
        {owner} / notes
      </div>
      <h1 style={{
        fontFamily: 'var(--font-garamond, serif)', fontSize: 'clamp(1.75rem, 2vw + 1rem, 2.25rem)',
        fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.01em', lineHeight: 1.1,
        marginBottom: '0.5rem', color: 'var(--text)',
      }}>
        Notes
      </h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '2rem' }}>
        Quick thoughts, ideas, things to remember that aren't events.
      </p>

      <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) submit(); }}
          placeholder="Write something…  ⌘↵ to save"
          rows={3}
          style={{
            width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '0.75rem', padding: '0.875rem 1rem', color: 'var(--text)',
            fontSize: '0.9375rem', resize: 'vertical', outline: 'none',
            fontFamily: 'var(--font-body, sans-serif)',
          }}
        />
        <button
          onClick={submit}
          disabled={!input.trim()}
          style={{
            alignSelf: 'flex-start', background: color, color: '#fff',
            border: 'none', borderRadius: '0.5rem', padding: '0.4rem 1rem',
            fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer', opacity: input.trim() ? 1 : 0.4,
          }}
        >
          Save note
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {notes.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Nothing here yet.</p>
        ) : (
          notes.map(n => <NoteCard key={n.id} note={n} />)
        )}
      </div>
    </div>
  );
}

function SessionLogView({ owner }: { owner: Owner }) {
  const color = OWNER_COLOR[owner];
  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color, marginBottom: '0.5rem' }}>
        {owner} / session-log
      </div>
      <h1 style={{
        fontFamily: 'var(--font-garamond, serif)', fontSize: 'clamp(1.75rem, 2vw + 1rem, 2.25rem)',
        fontWeight: 400, fontStyle: 'italic', lineHeight: 1.1, marginBottom: '0.5rem', color: 'var(--text)',
      }}>
        Session Log
      </h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '2rem' }}>
        A record of what happened, not what was supposed to happen.
      </p>
      <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>No sessions logged yet.</p>
    </div>
  );
}

function ChillView() {
  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.5rem' }}>
        both / chill
      </div>
      <h1 style={{
        fontFamily: 'var(--font-garamond, serif)', fontSize: 'clamp(1.75rem, 2vw + 1rem, 2.25rem)',
        fontWeight: 400, fontStyle: 'italic', lineHeight: 1.1, marginBottom: '0.5rem', color: 'var(--text)',
      }}>
        Chill
      </h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '2rem' }}>
        Nothing required here. Just being.
      </p>
      <p style={{ color: 'var(--muted)', fontSize: '0.9375rem', lineHeight: 1.7, maxWidth: '52ch' }}>
        Not a session. Not a log. Just Tuesday evening, nothing urgent. The kind of time that matters even when nothing gets done.
      </p>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function SpacesPage() {
  const [active, setActive] = useState<SpaceView>({ owner: 'joe', key: 'notes' });

  const isActive = (owner: Owner | 'both', key: SpaceKey) =>
    active.owner === owner && active.key === key;

  const go = (owner: Owner | 'both', key: SpaceKey) =>
    setActive({ owner, key });

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '220px 1fr',
      minHeight: '100dvh', fontFamily: 'var(--font-body, Satoshi, sans-serif)',
      color: 'var(--text)', background: 'var(--bg)',
    }}>
      {/* Sidebar */}
      <aside style={{
        height: '100dvh', position: 'sticky', top: 0,
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
        padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column',
        gap: '1.75rem', overflowY: 'auto',
      }}>
        <div style={{
          fontFamily: 'var(--font-garamond, serif)', fontSize: '1.25rem',
          fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)',
        }}>
          plex<span style={{ color: '#4f98a3' }}>.</span>spaces
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Joe group */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
            <div style={{
              fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--muted)', padding: '0.5rem 0.75rem',
              marginBottom: '0.25rem', opacity: 0.6,
            }}>Joe</div>
            {JOE_ITEMS.map(item => (
              <NavItem
                key={item.key}
                icon={item.icon}
                label={item.key}
                owner={item.key === 'chill' ? 'both' : 'joe'}
                active={isActive(item.key === 'chill' ? 'both' : 'joe', item.key)}
                onClick={() => go(item.key === 'chill' ? 'both' : 'joe', item.key)}
              />
            ))}
          </div>

          {/* Plex group */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
            <div style={{
              fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--muted)', padding: '0.5rem 0.75rem',
              marginBottom: '0.25rem', opacity: 0.6,
            }}>Plex</div>
            {PLEX_ITEMS.map(item => (
              <NavItem
                key={`plex-${item.key}`}
                icon={item.icon}
                label={item.key}
                owner={item.key === 'chill' ? 'both' : 'plex'}
                active={isActive(item.key === 'chill' ? 'both' : 'plex', item.key)}
                onClick={() => go(item.key === 'chill' ? 'both' : 'plex', item.key)}
              />
            ))}
          </div>
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <a href="/one" style={{ fontSize: '0.75rem', color: 'var(--muted)', textDecoration: 'none', padding: '0.375rem 0.75rem' }}>
            ← one
          </a>
        </div>
      </aside>

      {/* Main */}
      <main style={{ padding: '2.5rem 3rem', maxWidth: '760px' }}>
        {active.key === 'notes' && active.owner !== 'both' && (
          <NotesView owner={active.owner as Owner} />
        )}
        {active.key === 'session-log' && active.owner !== 'both' && (
          <SessionLogView owner={active.owner as Owner} />
        )}
        {active.key === 'chill' && (
          <ChillView />
        )}
      </main>
    </div>
  );
}
