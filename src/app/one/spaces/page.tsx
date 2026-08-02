// src/app/one/spaces/page.tsx
// Spaces — standalone route (honest scaffold)
// The full spaces feature lives inside one/page.tsx SpacesView.
// This route redirects into the ONE shell at the spaces tab.

'use client';

import { useEffect } from 'react';

export default function SpacesPage() {
  useEffect(() => {
    // Redirect into ONE shell — spaces view lives there
    window.location.replace('/one#spaces');
  }, []);

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', color: 'var(--muted)',
      fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
      letterSpacing: '0.1em',
    }}>
      redirecting to spaces…
    </div>
  );
}
