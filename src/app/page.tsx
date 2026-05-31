"use client";
import { useState } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<{title: string; url: string}[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    const searchRes = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const searchData = await searchRes.json();

    const answerRes = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, results: searchData.results }),
    });
    const answerData = await answerRes.json();

    setAnswer(answerData.answer);
    setSources(answerData.sources);
    setLoading(false);
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Kairos</h1>
      <div className="flex gap-2 mb-6">
        <input
          className="flex-1 border rounded px-4 py-2"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="Ask anything..."
        />
        <button
          className="bg-black text-white px-6 py-2 rounded"
          onClick={search}
        >
          {loading ? "..." : "Ask"}
        </button>
      </div>
      {answer && (
        <div className="mb-6 prose">{answer}</div>
      )}
      {sources.length > 0 && (
        <ul className="text-sm text-gray-500 space-y-1">
          {sources.map((s, i) => (
            <li key={i}>[{i+1}] <a href={s.url} target="_blank" className="underline">{s.title}</a></li>
          ))}
        </ul>
      )}
    </main>
  );
}