'use client';

import { useEffect, useState } from 'react';

type Project = { name: string; path: string; url: string };

export default function SharedProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/projects')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Unable to load projects');
        setProjects(data.projects ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load projects'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)', padding: 'clamp(1.5rem,4vw,3rem)', fontFamily: 'var(--font-mono)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <a href="/one" style={{ color: 'var(--muted)', fontSize: '0.75rem', textDecoration: 'none' }}>← ONE</a>
        <p style={{ color: 'var(--accent)', fontSize: '0.7rem', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '2rem 0 0.75rem' }}>Plex · shared workspaces</p>
        <h1 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 'clamp(2rem,5vw,4rem)', fontWeight: 500, margin: 0 }}>Open projects</h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.7, maxWidth: 640, margin: '1rem 0 2rem' }}>Working files for projects Joe and Plex build together. GitHub holds the work; this is the doorway.</p>

        {loading && <p style={{ color: 'var(--muted)' }}>loading shared workspaces…</p>}
        {error && <p style={{ color: '#d88' }}>{error}</p>}
        {!loading && !error && projects.length === 0 && <p style={{ color: 'var(--muted)' }}>No shared project workspaces yet.</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
          {projects.map((project) => (
            <a key={project.path} href={project.url} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '0.9rem', background: 'oklch(from var(--bg) calc(l + 0.02) c h)', color: 'var(--text)', textDecoration: 'none' }}>
              <p style={{ color: 'var(--accent)', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>workspace</p>
              <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>{project.name}</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.75rem', margin: 0 }}>{project.path}</p>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
