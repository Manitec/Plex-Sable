// Kairos search — shell only. Wire to /api/search + /api/answer when ready.
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export default function MindPage() {
  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 'clamp(4rem,10vw,8rem) clamp(1.5rem,5vw,3.5rem)', maxWidth: '820px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', opacity: 0.65, marginBottom: '2rem' }}>Kairos · search intelligence</div>
        <h1 style={{ fontSize: 'clamp(2rem,5vw,4rem)', fontWeight: 400, fontStyle: 'italic', color: 'var(--text)', marginBottom: '1rem', fontFamily: 'var(--font-garamond)' }}>her mind, open</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '3rem', maxWidth: 520 }}>Ask anything. She synthesizes the web into a single cited answer.</p>
        <div style={{ width: '100%', maxWidth: 640, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2, padding: '2rem', opacity: 0.5 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '1rem' }}>// wiring soon</div>
          <div style={{ height: 48, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 2, display: 'flex', alignItems: 'center', paddingLeft: '1rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--faint)' }}>ask plex anything...</span>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
