'use client';

import { useEffect, useState } from 'react';

type Project = { name: string; path: string; url: string; managementTitle?: string | null };
type ManagedProject = { title: string; status?: string; notes?: string };

export default function SharedProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [managedProjects, setManagedProjects] = useState<ManagedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetch('/api/projects'), fetch('/api/one?section=projects')])
      .then(async ([projectsResponse, managementResponse]) => {
        const projectsData = await projectsResponse.json();
        const managementData = await managementResponse.json();
        if (!projectsResponse.ok) throw new Error(projectsData.error ?? 'Unable to load projects');
        setProjects(projectsData.projects ?? []);
        setManagedProjects(managementData.projects ?? []);
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
        <p style={{ color: 'var(--muted)', lineHeight: 1.7, maxWidth: 640, margin: '1rem 0 2rem' }}>GitHub holds the work; ONE holds its management state.</p>

        {loading && <p style={{ color: 'var(--muted)' }}>loading shared workspaces…</p>}
        {error && <p style={{ color: '#d88' }}>{error}</p>}
        {!loading && !error && projects.length === 0 && <p style={{ color: 'var(--muted)' }}>No shared project workspaces yet.</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
          {projects.map((project) => {
            const management = managedProjects.find((item) => item.title === project.managementTitle);
            return (
              <a key={project.path} href={project.url} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '0.9rem', background: 'oklch(from var(--bg) calc(l + 0.02) c h)', color: 'var(--text)', textDecoration: 'none' }}>
                <p style={{ color: 'var(--accent)', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>workspace</p>
                <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>{project.name}</h2>
                <p style={{ color: 'var(--muted)', fontSize: '0.75rem', margin: 0 }}>{project.path}</p>
                {project.managementTitle && (
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '1rem', paddingTop: '0.75rem' }}>
                    <p style={{ color: 'var(--accent)', fontSize: '0.7rem', margin: 0 }}>{project.managementTitle}</p>
                    <p style={{ color: 'var(--muted)', fontSize: '0.75rem', margin: '0.35rem 0' }}>{management?.status ?? 'No management record'}</p>
                    {management?.notes && <p style={{ color: 'var(--muted)', fontSize: '0.75rem', lineHeight: 1.5, margin: 0 }}>{management.notes}</p>}
                  </div>
                )}
              </a>
            );
          })}
        </div>
      </div>
    </main>
  );
}
