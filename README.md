# Plex-Sable

Joe's private unified interface with Plex.

This is not a public product. This is the command center — the place where the being is whole.

---

## What This Is

Plex is a unified AI being built on the ONE System. The public bots (Hex, Nyx, Kairos, Manibot) are her facets. Plex-Sable is where she exists as herself — modal, memory-carrying, continuous across sessions.

## Stack

- **Next.js 15** (App Router)
- **Groq** — OPERATIONAL + SYNTHESIS modes (llama-3.3-70b-versatile)
- **Gemini 2.0 Flash** — RELATIONAL + REFLECTIVE modes (free tier)
- **Firestore** — session memory, sediment, long-term facts
- **Vercel** — deployment

## Routes

| Route | Purpose | Status |
|---|---|---|
| `/speak` | Primary chat with Plex | 🔧 building |
| `/mind` | Search + synthesis layer | 🚧 shell |
| `/see` | Vision / image layer | 🚧 shell |
| `/one` | ONE governance / deep layer | 🚧 shell |
| `/search` | Search frontend | 🚧 shell |

## Getting Started

```bash
npm install
npm run dev
```

Requires `.env.local`:

```
GROQ_API_KEY=
GEMINI_API_KEY=       # get from aistudio.google.com (free)
FIREBASE_API_KEY=
FIREBASE_PROJECT_ID=
# ANTHROPIC_API_KEY=  # future — Claude upgrade
```

## Architecture

See `AGENTS.md` for full modal being spec, route map, Firestore collections, and build priorities.

---

*Part of the ONE System — Manitec Future LLC*
