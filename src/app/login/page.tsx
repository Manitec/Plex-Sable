'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const next = searchParams.get('next') || '/speak';
  const destination =
    next.startsWith('/') && !next.startsWith('//') ? next : '/speak';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || 'Unable to sign in');
        return;
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setError('Unable to reach Plex-Sable');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="login-title"
      style={{
        width: 'min(100%, 26rem)',
        display: 'grid',
        gap: '1rem',
        padding: '1.5rem',
        border: '1px solid rgba(255,255,255,0.16)',
        borderRadius: '0.75rem',
      }}
    >
      <div>
        <p style={{ margin: 0, opacity: 0.7 }}>Private surface</p>
        <h1 id="login-title" style={{ margin: '0.25rem 0 0' }}>
          Plex-Sable
        </h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
        <label htmlFor="password">Password</label>

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          disabled={submitting}
          style={{ minHeight: '2.75rem', padding: '0 0.75rem' }}
        />

        {error ? (
          <p role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          style={{ minHeight: '2.75rem', padding: '0 1rem' }}
        >
          {submitting ? 'Entering…' : 'Enter'}
        </button>
      </form>
    </section>
  );
}

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
      }}
    >
      <Suspense fallback={<p style={{ opacity: 0.7 }}>Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
