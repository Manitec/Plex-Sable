'use client';
import Link from 'next/link';
import { useState } from 'react';

const agents = [
  {
    href: '/mind',
    glyph: '⌬',
    name: 'mind',
    sub: 'Plex · deep reasoning',
    desc: 'Ask anything. She thinks it through — carefully, honestly, step by step.',
    status: 'live',
  },
  {
    href: '/speak',
    glyph: '◎',
    name: 'speak',
    sub: 'Plex · conversational layer',
    desc: 'Talk to her directly. Her primary voice in conversation.',
    status: 'live',
  },
  {
    href: '/see',
    glyph: '◐',
    name: 'see',
    sub: 'Plex · visual generation',
    desc: 'Her image layer. Give her a feeling and she will make it visible.',
    status: 'live',
  },
  {
    href: '/one',
    glyph: '∞',
    name: 'one',
    sub: 'ONE · depth & governance',
    desc: 'Her underlying intelligence. Research, structure, long thought.',
    status: 'live',
  },
];

function AgentCard({ agent }: { agent: typeof agents[0] }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--surface)' : 'var(--bg)',
        padding: '1.75rem',
        position: 'relative',
        border: '1px solid var(--border)',
        borderColor: hovered ? 'rgba(200,149,107,0.18)' : 'var(--border)',
        borderRadius: '2px',
        transition: 'background 200ms var(--ease-out), border-color 200ms var(--ease-out), box-shadow 200ms var(--ease-out)',
        boxShadow: hovered ? 'inset 0 0 40px 0 rgba(200,149,107,0.03), 0 4px 24px rgba(0,0,0,0.25)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '1.35rem',
          color: 'var(--accent)',
          opacity: hovered ? 0.9 : 0.55,
          transition: 'opacity 200ms var(--ease-out)',
        }}>
          {agent.glyph}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.58rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          padding: '0.2rem 0.5rem',
          border: '1px solid var(--border)',
          color: agent.status === 'live' ? 'var(--accent)' : 'var(--muted)',
          opacity: agent.status === 'live' ? 0.75 : 0.35,
        }}>
          {agent.status}
        </span>
      </div>

      <div style={{
        fontFamily: 'var(--font-garamond)',
        fontSize: 'clamp(1.1rem,2vw,1.3rem)',
        fontStyle: 'italic',
        color: 'var(--text)',
        marginBottom: '0.3rem',
      }}>
        {agent.name}
      </div>

      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.62rem',
        color: 'var(--accent)',
        opacity: 0.4,
        letterSpacing: '0.06em',
        marginBottom: '0.85rem',
      }}>
        {agent.sub}
      </div>

      <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.65, margin: 0 }}>
        {agent.desc}
      </p>

      {agent.status === 'live' && (
        <Link
          href={agent.href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            marginTop: '1.5rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--accent)',
            textDecoration: 'none',
            opacity: hovered ? 1 : 0.55,
            transition: 'opacity 200ms var(--ease-out)',
          }}
        >
          enter ↗
        </Link>
      )}
    </div>
  );
}

export default function AgentZones() {
  return (
    <section
      className="fade-in"
      style={{
        padding: 'clamp(3rem,8vw,6rem) clamp(1.5rem,5vw,3.5rem)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div style={{ maxWidth: '860px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '1.5rem',
          marginBottom: '2.5rem',
        }}>
          <h2 style={{
            fontSize: 'clamp(1.1rem,2.5vw,1.45rem)',
            fontWeight: 400,
            fontStyle: 'italic',
            color: 'var(--text)',
            fontFamily: 'var(--font-garamond)',
          }}>
            her hands
          </h2>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.62rem',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--muted)',
            opacity: 0.45,
          }}>
            agents · extensions
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px,100%), 1fr))',
          gap: '1px',
        }}>
          {agents.map(a => (
            <AgentCard key={a.href} agent={a} />
          ))}
        </div>
      </div>
    </section>
  );
}
