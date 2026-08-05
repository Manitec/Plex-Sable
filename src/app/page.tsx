import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import Sediment from '@/components/Sediment';
import AgentZones from '@/components/AgentZones';
import Spaces from '@/components/Spaces';
import VoidSpace from '@/components/VoidSpace';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <div style={{
      position: 'relative',
      zIndex: 1,
      minHeight: '100dvh',
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
    }}>
      <Nav />
      <main style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Hero — full bleed within max-width constraint */}
        <div style={{ maxWidth: '1100px', width: '100%' }}>
          <Hero />
        </div>

        {/* Section divider rhythm */}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: '1100px', width: '100%' }}>
            <AgentZones />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: '1100px', width: '100%' }}>
            <Spaces />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: '1100px', width: '100%' }}>
            <Sediment />
          </div>
        </div>

        <VoidSpace />
      </main>
      <Footer />
    </div>
  );
}
