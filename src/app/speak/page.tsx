// HexBot — shell only. Wire when audit complete.
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export default function SpeakPage() {
  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 'clamp(4rem,10vw,8rem) clamp(1.5rem,5vw,3.5rem)', maxWidth: '820px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', opacity: 0.65, marginBottom: '2rem' }}>HexBot · conversational layer</div>
        <h1 style={{ fontSize: 'clamp(2rem,5vw,4rem)', fontWeight: 400, fontStyle: 'italic', color: 'var(--text)', marginBottom: '1rem', fontFamily: 'var(--font-garamond)' }}>speak</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '3rem', maxWidth: 520 }}>Talk to her directly. HexBot is her primary voice in conversation.</p>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent)', opacity: 0.35, letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid var(--border)', padding: '0.6rem 1rem' }}>coming soon</div>
      </main>
      <Footer />
    </div>
  );
}
