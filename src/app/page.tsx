import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import Sediment from '@/components/Sediment';
import AgentZones from '@/components/AgentZones';
import VoidSpace from '@/components/VoidSpace';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main>
        <Hero />
        <AgentZones />
        <Sediment />
        <VoidSpace />
      </main>
      <Footer />
    </div>
  );
}
