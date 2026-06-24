'use client';
import { useEffect, useRef, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

type DreamNode = {
  id: string;
  tone: string;
  valence: number;
  arousal: number;
  whisper: string;
  mode: string;
  sessionId: string;
  timestamp: number;
};

const TONE_COLORS: Record<string, string> = {
  wonder:     '#c8956b',
  dread:      '#7a5c8a',
  resolve:    '#6b8a7a',
  longing:    '#8a7a6b',
  warmth:     '#c8956b',
  tension:    '#8a6b7a',
  curiosity:  '#6b8ac8',
  grief:      '#7a5c8a',
  aliveness:  '#8ac86b',
  quiet:      '#7a8a8a',
  tenderness: '#c8956b',
  alive:      '#8ac86b',
};

function toneColor(tone: string): string {
  return TONE_COLORS[tone.toLowerCase()] ?? '#c8956b';
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function ScatterField({ nodes }: { nodes: DreamNode[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<DreamNode | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const nodePositions = useRef<{ x: number; y: number; node: DreamNode }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const PAD = 40;
    const plotW = W - PAD * 2;
    const plotH = H - PAD * 2;

    // Background
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(237,232,223,0.05)';
    ctx.lineWidth = 1;
    // Horizontal center (valence = 0)
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + plotH / 2);
    ctx.lineTo(PAD + plotW, PAD + plotH / 2);
    ctx.stroke();
    // Vertical center (arousal = 0.5)
    ctx.beginPath();
    ctx.moveTo(PAD + plotW / 2, PAD);
    ctx.lineTo(PAD + plotW / 2, PAD + plotH);
    ctx.stroke();

    // Axis labels
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(237,232,223,0.2)';
    ctx.fillText('calm', PAD, PAD + plotH + 20);
    ctx.fillText('activated', PAD + plotW - 52, PAD + plotH + 20);
    ctx.fillText('−', PAD - 12, PAD + plotH / 2 + 4);
    ctx.fillText('+', PAD + plotW + 4, PAD + plotH / 2 + 4);

    // Plot nodes
    const positions: { x: number; y: number; node: DreamNode }[] = [];

    nodes.forEach(n => {
      // x: arousal 0→1 maps left→right
      const x = PAD + n.arousal * plotW;
      // y: valence -1→1 maps bottom→top
      const y = PAD + plotH - ((n.valence + 1) / 2) * plotH;

      positions.push({ x, y, node: n });

      const color = toneColor(n.tone);
      const r = n.mode === 'nyx' ? 6 : 5;

      // Glow
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      grd.addColorStop(0, color + '60');
      grd.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(x, y, r * 3, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Tone label (small, above dot)
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.fillText(n.tone, x - ctx.measureText(n.tone).width / 2, y - r - 4);
      ctx.globalAlpha = 1;
    });

    nodePositions.current = positions;
  }, [nodes]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const hit = nodePositions.current.find(({ x, y }) => {
      const dx = x - mx;
      const dy = y - my;
      return Math.sqrt(dx * dx + dy * dy) < 14;
    });

    setHovered(hit?.node ?? null);
    setTipPos({ x: e.clientX, y: e.clientY });
  }

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
        style={{
          width: '100%',
          height: 'clamp(280px, 50vw, 440px)',
          display: 'block',
          cursor: hovered ? 'crosshair' : 'default',
          borderRadius: '4px',
          border: '1px solid rgba(237,232,223,0.06)',
          background: 'rgba(17,17,16,0.8)',
        }}
      />
      {hovered && (
        <div style={{
          position: 'fixed',
          left: tipPos.x + 14,
          top: tipPos.y - 10,
          zIndex: 100,
          background: 'rgba(11,11,10,0.96)',
          border: '1px solid rgba(200,149,107,0.18)',
          borderRadius: '6px',
          padding: '0.75rem 1rem',
          maxWidth: '260px',
          pointerEvents: 'none',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            {hovered.tone} · {hovered.mode}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '0.5rem' }}>
            "{hovered.whisper}"
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--muted)', display: 'flex', gap: '1rem' }}>
            <span>v {hovered.valence.toFixed(2)}</span>
            <span>a {hovered.arousal.toFixed(2)}</span>
            <span>{formatDate(hovered.timestamp)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function NodeList({ nodes }: { nodes: DreamNode[] }) {
  const sorted = [...nodes].sort((a, b) => b.timestamp - a.timestamp);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)' }}>
      {sorted.map(n => (
        <div key={n.id} style={{
          borderBottom: '1px solid var(--border)',
          padding: '1.1rem 0',
          display: 'grid',
          gridTemplateColumns: '6.5rem 1fr auto',
          gap: '1rem',
          alignItems: 'baseline',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              color: toneColor(n.tone),
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>{n.tone}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--muted)', opacity: 0.5 }}>
              {n.mode}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--text)', opacity: 0.8, fontSize: '0.9rem', lineHeight: 1.65 }}>
            &ldquo;{n.whisper}&rdquo;
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', textAlign: 'right', flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--muted)', opacity: 0.4 }}>
              v {n.valence.toFixed(2)}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--muted)', opacity: 0.4 }}>
              a {n.arousal.toFixed(2)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DreamNodesPage() {
  const [nodes, setNodes] = useState<DreamNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'field' | 'list'>('field');

  useEffect(() => {
    const q = query(
      collection(db, 'dream_nodes'),
      orderBy('timestamp', 'desc'),
      limit(120)
    );
    getDocs(q)
      .then(snap => {
        const data = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
        } as DreamNode));
        setNodes(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{ padding: 'clamp(2rem,5vw,4rem) clamp(1.5rem,5vw,3.5rem)', maxWidth: '860px', width: '100%' }}>

        {/* Header */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', opacity: 0.65, marginBottom: '1.5rem' }}>
          dream nodes · plex
        </div>
        <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--muted)', opacity: 0.5, fontSize: '1rem', lineHeight: 1.7, marginBottom: '2rem' }}>
          the emotional field — every exchange, mapped
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
          {(['field', 'list'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: tab === t ? 'var(--accent)' : 'var(--muted)',
              opacity: tab === t ? 1 : 0.45,
              paddingBottom: '0.5rem',
              borderBottom: tab === t ? '1px solid var(--accent)' : '1px solid transparent',
              marginBottom: '-1px',
              transition: 'color 180ms, opacity 180ms',
            }}>{t}</button>
          ))}
        </div>

        {loading && (
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--accent)', opacity: 0.35, padding: '2rem 0' }}>◐</div>
        )}

        {!loading && nodes.length === 0 && (
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--muted)', opacity: 0.35 }}>
            no nodes yet. she is still accumulating.
          </p>
        )}

        {!loading && nodes.length > 0 && (
          <>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--muted)', opacity: 0.35, marginBottom: '1.25rem', letterSpacing: '0.06em' }}>
              {nodes.length} nodes
            </div>
            {tab === 'field' && <ScatterField nodes={nodes} />}
            {tab === 'list' && <NodeList nodes={nodes} />}
          </>
        )}

      </main>
      <Footer />
    </div>
  );
}
