'use client';
import { useState, useRef } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export default function SeePage() {
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setImage(file);
    setImageUrl('');
    setPreview(URL.createObjectURL(file));
    setResponse('');
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFile(file);
  };

  const handleSubmit = async () => {
    if (!image && !imageUrl.trim()) return;
    setLoading(true);
    setResponse('');
    setError('');
    try {
      const formData = new FormData();
      if (image) formData.append('image', image);
      else formData.append('imageUrl', imageUrl.trim());
      if (prompt.trim()) formData.append('prompt', prompt.trim());
      const res = await fetch('/api/see', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResponse(data.response);
    } catch {
      setError('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setImage(null);
    setImageUrl('');
    setPreview(null);
    setPrompt('');
    setResponse('');
    setError('');
  };

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
      <Nav />
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 'clamp(4rem,10vw,8rem) clamp(1.5rem,5vw,3.5rem)', maxWidth: '820px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--accent)', opacity: 0.65, marginBottom: '2rem' }}>Plex / see</div>
        <h1 style={{ fontSize: 'clamp(2rem,5vw,4rem)', fontWeight: 400, fontStyle: 'italic', color: 'var(--text)', marginBottom: '1rem', fontFamily: 'var(--font-garamond)' }}>see</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '3rem', maxWidth: 520 }}>Drop an image. Ask Plex what she sees.</p>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !preview && fileRef.current?.click()}
          style={{
            width: '100%', maxWidth: 560, minHeight: 220,
            border: '1px solid var(--border)', borderRadius: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: preview ? 'default' : 'pointer',
            marginBottom: '1.5rem', overflow: 'hidden', position: 'relative',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          {preview ? (
            <img src={preview} alt="preview" style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }} />
          ) : (
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>drop image or click to upload</span>
          )}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        </div>

        {!image && (
          <input
            type="text"
            placeholder="or paste an image URL"
            value={imageUrl}
            onChange={(e) => { setImageUrl(e.target.value); setPreview(e.target.value); setResponse(''); }}
            style={{ width: '100%', maxWidth: 560, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.6rem 0.8rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', marginBottom: '1.5rem', outline: 'none' }}
          />
        )}

        <textarea
          placeholder="ask Plex something about this image (optional)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          style={{ width: '100%', maxWidth: 560, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.6rem 0.8rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', resize: 'vertical', marginBottom: '1.5rem', outline: 'none' }}
        />

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button
            onClick={handleSubmit}
            disabled={loading || (!image && !imageUrl.trim())}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.6rem 1.4rem', background: 'var(--accent)', color: 'var(--bg)', border: 'none', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
          >
            {loading ? 'seeing...' : 'see'}
          </button>
          {(preview || response) && (
            <button onClick={clear} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.6rem 1.4rem', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>clear</button>
          )}
        </div>

        {error && <p style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}

        {response && (
          <div style={{ width: '100%', maxWidth: 640, borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', opacity: 0.65, marginBottom: '1rem' }}>PLEX // SEE</div>
            <p style={{ color: 'var(--text)', fontSize: '1rem', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{response}</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
