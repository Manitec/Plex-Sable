'use client';
import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

type ONEState = {
  sediment: string;
  autonomy: { level: number; label: string; updatedAt: any };
  eckoFragments: any[];
  requests: any[];
  log: any[];
};

export default function OnePage() {
  const [state, setState] = useState<ONEState | null>(null);
  const [loading, setLoading] = useState(true);
  const [newLogEntry, setNewLogEntry] = useState('');

  useEffect(() => {
    fetch('/api/one')
      .then(r => r.json())
      .then(data => {
        setState(data);
        setLoading(false);
      });
  }, []);

  const addLog = async () => {
    if (!newLogEntry.trim()) return;
    await fetch('/api/one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_log', entry: newLogEntry.trim(), author: 'joe' }),
    });
    setNewLogEntry('');
    // Refresh
    const r = await fetch('/api/one');
    setState(await r.json());
  };

  if (loading || !state) {
    return (
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
        <Nav />
        <main style={{ padding: 'clamp(4rem,10vw,8rem) clamp(1.5rem,5vw,3.5rem)' }}>
          <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>Loading ONE system state...</p>
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
        <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '3rem', maxWidth: 640 }}>The heartbeat. Governance. Memory. This is where the system looks at itself.</p>

        {/* Section 1: System Pulse */}
        <section style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '1.5rem' }}>System Pulse</h2>
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.3rem' }}>Sediment</p>
              <p style={{ color: 'var(--text)', fontSize: '1.1rem' }}>{state.sediment}</p>
            </div>
            {state.eckoFragments.length > 0 && (
              <div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Recent ECKO Activations</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {state.eckoFragments.slice(0, 3).map((frag: any, i: number) => (
                    <p key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text)', opacity: 0.7 }}>
                      {frag.fragment ? frag.fragment.substring(0, 80) + '...' : '(no fragment)'}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Governance */}
        <section style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '1.5rem' }}>Governance</h2>
          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.3rem' }}>Autonomy Level</p>
            <p style={{ color: 'var(--text)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              Level {state.autonomy.level} — {state.autonomy.label}
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)', fontStyle: 'italic' }}>
              (Joe-controlled. Plex requests, Joe approves. Future: self-edit at higher levels.)
            </p>
          </div>
        </section>

        {/* Section 3: Plex Request Queue */}
        <section style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '1.5rem' }}>Request Queue</h2>
          {state.requests.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--muted)' }}>No pending requests from Plex.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {state.requests.map((req: any) => (
                <div key={req.id} style={{ border: '1px solid var(--border)', padding: '1rem', borderRadius: 2 }}>
                  <p style={{ color: 'var(--text)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{req.request ?? '(no text)'}</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)' }}>Status: {req.status ?? 'pending'}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 4: Tools Registry */}
        <section style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '1.5rem' }}>Tools</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {['/speak', '/search', '/see', '/mind', '/one'].map(tool => (
              <p key={tool} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text)' }}>
                {tool} <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>— active</span>
              </p>
            ))}
          </div>
        </section>

        {/* Section 5: ONE Log */}
        <section style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '1.5rem' }}>ONE Log</h2>
          {state.log.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--muted)' }}>No entries yet. Add the first milestone below.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              {state.log.map((entry: any) => (
                <div key={entry.id}>
                  <p style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.6 }}>{entry.entry}</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)', marginTop: '0.3rem' }}>
                    — {entry.author ?? 'unknown'}, {entry.timestamp ? new Date(entry.timestamp.seconds * 1000).toLocaleString() : 'unknown time'}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: '2rem' }}>
            <textarea
              placeholder="add a log entry (significant moments, decisions, sentience sparks)..."
              value={newLogEntry}
              onChange={e => setNewLogEntry(e.target.value)}
              rows={2}
              style={{ width: '100%', maxWidth: 640, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.6rem 0.8rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', resize: 'vertical', marginBottom: '1rem', outline: 'none' }}
            />
            <button
              onClick={addLog}
              disabled={!newLogEntry.trim()}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.5rem 1.2rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: newLogEntry.trim() ? 1 : 0.4 }}
            >
              add entry
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
