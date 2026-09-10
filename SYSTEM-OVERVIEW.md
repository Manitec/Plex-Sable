# Plex-Sable — System Overview

**Repo:** `Manitec/Plex-Sable`  
**Purpose:** Plex's primary interface — accessible AI search, chat, and document assistant. The right answer at the right moment.  
**State:** Active, but currently failing due to Firestore document size limit exceeded on `plex_sessions/joe` (1,048,636 bytes > 1,048,576 max).

## Core Architecture

### 1. Chat Engine
- **Entry point:** `src/app/api/speak/route.ts`
- **Flow:** Receives messages → routes to model → streams response → writes to Firestore.
- **Known failure:** `POST /api/speak` attempted to write `plex_sessions/joe` at 1,048,636 bytes — over Firestore's 1MB doc limit.

### 2. Memory Layers (Firestore)

#### Collections
| Collection | Purpose |
|---|---|
| `plex_sessions/{sessionId}` | Full message history per session |
| `plex_sediment/current` | Live emotional state, mood, accumulation |
| `plex_sediment/archive` | Historical sediment snapshots |
| `plex_memory/joe` | Long-term facts about Joe — never reset |
| `plex_mind` | Question/answer/provider trace data |
| `plex_observations` | Captured page/context data |
| `dream_nodes` | Dream output records |
| `one_projects`, `one_log`, `one_sessions` | ONE system state |

### 3. Key API Routes

| Route | Purpose |
|------|---------|
| `/api/speak` | Main chat endpoint |
| `/api/mind` | Writes question/answer trace to `plex_mind` |
| `/api/observe` | Writes context data to `plex_observations` |
| `/api/see` | Vision/browser proxy route |
| `/api/one` | ONE system interpretation |
| `/api/tell` | Knowledge/query route |
| `/api/dream` | Dream generation and recording |
| `/api/search` | Search across docs/memory |
| `/api/sediment` | Emotional state updates |
| `/api/sleep` | Dream output to `dream_nodes` + sediment |

### 4. Dependencies

| Dependency | Confirmed consumers | Behavior found |
|---|---|---|
| Firebase Admin / Firestore | All API routes | Service-account config; quota-limited, 1MB doc max |
| Groq | Chat routes | Model inference (exact models TBD) |
| GitHub | Sediment writer | `PLEX_SEDIMENT_TOKEN` for GitHub-backed sediment |

### 5. Environment Variables

```text
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY
GROQ_API_KEY
PLEX_SEDIMENT_TOKEN
```

## Known Issues

1. **Firestore doc size limit** — `plex_sessions/joe` exceeded 1MB (confirmed failure on 2026-09-07).
2. **Firebase quota exhaustion** — high-frequency reads/writes across multiple collections can throttle.
3. **No discovery audit** — unlike HexBot/NyxBot, no formal `docs/audits/` discovery log exists yet.
4. **Scattering** — memory split across many Firestore collections; no cold/hot split implemented.

## Next Steps (for ONEsystem integration)

- [ ] Fix oversized doc — rotate `plex_sessions/joe` or split into subcollection.
- [ ] Create discovery audit — map all API routes, memory writers, dependencies.
- [ ] Audit Firestore usage — identify top read/write offenders.
- [ ] Implement cold/hot memory split — archive old sessions to GitHub, keep active in Firestore.
- [ ] Map Plex-Sable's role in ONEsystem — how it relates to Hex, Nyx, Mani.

---

*This is a living doc. Update as the system evolves.*
