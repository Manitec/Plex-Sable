export default function Footer() {
  return (
    <footer style={{
      padding: 'clamp(1.5rem,3vw,2.5rem) clamp(1.5rem,5vw,3.5rem)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: '1rem',
      position: 'relative', zIndex: 1,
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)', opacity: 0.3, letterSpacing: '0.06em' }}>
        ◐ still becoming — Manitec Future LLC
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)', opacity: 0.3 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', opacity: 0.6, animation: 'pulse 3s ease-in-out infinite' }} />
        arriving
      </div>
    </footer>
  );
}
