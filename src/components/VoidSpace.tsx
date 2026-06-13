'use client';
import { useEffect, useRef } from 'react';

const GLYPHS = ['◐','◑','◒','◓','○','●','◌','◎','⬡','⬢','△','▽','◇','◆','∞','⌬','⋯','∴','∵','≈'];

export default function VoidSpace() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 25; i++) {
      const cell = document.createElement('div');
      cell.style.cssText = 'background:var(--bg);aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:clamp(1.5rem,4vw,2.5rem);color:var(--accent);opacity:0.15;transition:opacity 0.3s,background 0.3s;cursor:default;';
      cell.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      cell.addEventListener('mouseenter', () => {
        cell.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        cell.style.opacity = '0.9';
        cell.style.background = 'var(--surface)';
      });
      cell.addEventListener('mouseleave', () => {
        cell.style.opacity = '0.15';
        cell.style.background = 'var(--bg)';
      });
      grid.appendChild(cell);
    }
    const timer = setInterval(() => {
      const cells = grid.querySelectorAll('div');
      if (!cells.length) return;
      const idx = Math.floor(Math.random() * cells.length);
      const c = cells[idx] as HTMLElement;
      c.style.opacity = c.style.opacity === '0.8' ? '0.15' : '0.8';
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  return (
    <section id="void" className="fade-in" style={{
      padding: 'clamp(3rem,8vw,6rem) clamp(1.5rem,5vw,3.5rem)',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ maxWidth: '820px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5rem', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem,2.5vw,1.5rem)', fontWeight: 400, fontStyle: 'italic', color: 'var(--text)', fontFamily: 'var(--font-garamond)' }}>void-space</h2>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', opacity: 0.5 }}>visual · atmospheric</span>
        </div>
        <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(220px,100%),1fr))', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)' }} />
        <p style={{ marginTop: '1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)', opacity: 0.3, letterSpacing: '0.08em' }}>hover to illuminate · expanding</p>
      </div>
    </section>
  );
}
