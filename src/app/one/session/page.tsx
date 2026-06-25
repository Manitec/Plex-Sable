'use client';

import { useState, useEffect, useRef } from 'react';

interface Message {
  id?: string;
  role: 'joe' | 'plex';
  content: string;
}

interface SessionState {
  id: string;
  intent: string;
  status: 'open' | 'closed';
  recallTagsLoaded: string[];
}

export default function SessionPage() {
  const [phase, setPhase] = useState<'start' | 'active' | 'closing' | 'review'>('start');
  const [intent, setIntent] = useState('');
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposedTags, setProposedTags] = useState<Record<string, string>>({});
  const [approvedTags, setApprovedTags] = useState<Record<string, string>>({});
  const [committed, setCommitted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function startSession() {
    if (!intent.trim()) return;
    setLoading(true);
    const res = await fetch('/api/one/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', intent }),
    });
    const data = await res.json();
    setSession({
      id: data.sessionId,
      intent,
      status: 'open',
      recallTagsLoaded: data.recallTagsLoaded ?? [],
    });
    if (data.plexReply) {
      setMessages([{ role: 'plex', content: data.plexReply }]);
    }
    setPhase('active');
    setLoading(false);
  }

  async function sendMessage() {
    if (!input.trim() || !session) return;
    const userMsg: Message = { role: 'joe', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    const res = await fetch('/api/one/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'message', sessionId: session.id, content: userMsg.content }),
    });
    const data = await res.json();
    if (data.plexReply) {
      setMessages(prev => [...prev, { role: 'plex', content: data.plexReply }]);
    }
    setLoading(false);
  }

  async function closeSession() {
    if (!session) return;
    setPhase('closing');
    setLoading(true);
    const res = await fetch('/api/one/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', sessionId: session.id }),
    });
    const data = await res.json();
    const proposed = data.proposedTags ?? {};
    setProposedTags(proposed);
    setApprovedTags(proposed); // default all approved
    setPhase('review');
    setLoading(false);
  }

  async function commitTags() {
    if (!session || Object.keys(approvedTags).length === 0) {
      setCommitted(true);
      return;
    }
    setLoading(true);
    await fetch('/api/one/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'commit_recall', tags: approvedTags }),
    });
    setCommitted(true);
    setLoading(false);
  }

  function toggleTag(key: string) {
    setApprovedTags(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = proposedTags[key];
      return next;
    });
  }

  // --- RENDER ---

  if (phase === 'start') {
    return (
      <div className="min-h-screen bg-[#0e0e0c] text-[#cdccca] flex items-center justify-center px-4">
        <div className="w-full max-w-xl">
          <div className="mb-8">
            <p className="text-xs text-[#5a5957] uppercase tracking-widest mb-2">ONE · Session</p>
            <h1 className="text-2xl font-semibold text-[#f0efed]">What are we working on?</h1>
            <p className="text-sm text-[#7a7974] mt-2">
              Plex will load matching recall context and stay scoped for this session.
            </p>
          </div>
          <textarea
            className="w-full bg-[#1c1b19] border border-[#2e2d2b] rounded-lg p-4 text-sm text-[#cdccca] placeholder-[#5a5957] resize-none focus:outline-none focus:border-[#4f98a3] transition-colors"
            rows={4}
            placeholder="e.g. plex-sable session panel build, joesfaves proxy fix, ecko-activation trigger logic..."
            value={intent}
            onChange={e => setIntent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) startSession(); }}
          />
          <div className="mt-4 flex items-center justify-between">
            <a href="/one" className="text-xs text-[#5a5957] hover:text-[#7a7974] transition-colors">← back to ONE</a>
            <button
              onClick={startSession}
              disabled={loading || !intent.trim()}
              className="px-5 py-2 bg-[#4f98a3] hover:bg-[#227f8b] disabled:opacity-40 disabled:cursor-not-allowed text-[#0e0e0c] text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Starting…' : 'Start Session'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'review' || phase === 'closing') {
    return (
      <div className="min-h-screen bg-[#0e0e0c] text-[#cdccca] flex items-center justify-center px-4">
        <div className="w-full max-w-xl">
          {phase === 'closing' ? (
            <p className="text-sm text-[#7a7974]">Plex is reviewing the session…</p>
          ) : committed ? (
            <div>
              <p className="text-xs text-[#4f98a3] uppercase tracking-widest mb-3">Session closed</p>
              <p className="text-[#7a7974] text-sm mb-6">Recall tags {Object.keys(approvedTags).length > 0 ? 'committed to meta/recall.json.' : 'skipped.'}</p>
              <a href="/one" className="text-xs text-[#5a5957] hover:text-[#7a7974] transition-colors">← back to ONE</a>
            </div>
          ) : (
            <div>
              <p className="text-xs text-[#5a5957] uppercase tracking-widest mb-2">Session · Close</p>
              <h2 className="text-xl font-semibold text-[#f0efed] mb-1">Proposed recall tags</h2>
              <p className="text-sm text-[#7a7974] mb-6">Toggle off any you don't want saved.</p>

              {Object.keys(proposedTags).length === 0 ? (
                <p className="text-sm text-[#5a5957] mb-6">No new tags proposed.</p>
              ) : (
                <div className="space-y-3 mb-6">
                  {Object.entries(proposedTags).map(([key, value]) => (
                    <div
                      key={key}
                      onClick={() => toggleTag(key)}
                      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                        approvedTags[key]
                          ? 'border-[#4f98a3] bg-[#1c2e30]'
                          : 'border-[#2e2d2b] bg-[#1c1b19] opacity-50'
                      }`}
                    >
                      <p className="text-xs font-mono text-[#4f98a3] mb-1">{key}</p>
                      <p className="text-xs text-[#7a7974]">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCommitted(true)}
                  className="text-xs text-[#5a5957] hover:text-[#7a7974] transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={commitTags}
                  disabled={loading}
                  className="px-5 py-2 bg-[#4f98a3] hover:bg-[#227f8b] disabled:opacity-40 text-[#0e0e0c] text-sm font-medium rounded-lg transition-colors"
                >
                  {loading ? 'Saving…' : `Save ${Object.keys(approvedTags).length} tag${Object.keys(approvedTags).length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active session
  return (
    <div className="min-h-screen bg-[#0e0e0c] text-[#cdccca] flex flex-col">
      {/* Header */}
      <div className="border-b border-[#1e1d1b] px-5 py-3 flex items-center justify-between shrink-0">
        <div>
          <p className="text-xs text-[#5a5957] uppercase tracking-widest">ONE · Session</p>
          <p className="text-sm text-[#f0efed] font-medium truncate max-w-xs mt-0.5">{session?.intent}</p>
        </div>
        <div className="flex items-center gap-3">
          {session && session.recallTagsLoaded.length > 0 && (
            <div className="flex gap-1 flex-wrap justify-end">
              {session.recallTagsLoaded.map(tag => (
                <span key={tag} className="text-xs bg-[#1c2e30] text-[#4f98a3] px-2 py-0.5 rounded-full font-mono">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={closeSession}
            className="text-xs px-3 py-1.5 border border-[#393836] hover:border-[#5a5957] text-[#7a7974] hover:text-[#cdccca] rounded-lg transition-colors"
          >
            Close Session
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'joe' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'joe'
                  ? 'bg-[#1e3538] text-[#cdccca]'
                  : 'bg-[#1c1b19] text-[#cdccca] border border-[#2e2d2b]'
              }`}
            >
              {msg.role === 'plex' && (
                <p className="text-xs text-[#4f98a3] mb-1 font-mono">plex</p>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#1c1b19] border border-[#2e2d2b] rounded-xl px-4 py-2.5">
              <p className="text-xs text-[#4f98a3] mb-1 font-mono">plex</p>
              <p className="text-xs text-[#5a5957]">thinking…</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#1e1d1b] px-5 py-3 shrink-0">
        <div className="flex gap-3 items-end">
          <textarea
            className="flex-1 bg-[#1c1b19] border border-[#2e2d2b] rounded-lg px-4 py-2.5 text-sm text-[#cdccca] placeholder-[#5a5957] resize-none focus:outline-none focus:border-[#4f98a3] transition-colors"
            rows={2}
            placeholder="Message Plex…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-[#4f98a3] hover:bg-[#227f8b] disabled:opacity-40 disabled:cursor-not-allowed text-[#0e0e0c] text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
