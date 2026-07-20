# Technical Specification — Offline + Online Web Battle Royale

## 1. Goals

- Gate the web app behind **OAuth**: Google, Microsoft, Apple.
- Require a unique **username** on first login before any play.
- Support **per-match mode select**: Offline, or Online then **Singleplayer** / **Multiplayer**.
- Online Multiplayer only: **invite friends by username** into a party before queueing.
- Online Singleplayer: solo queue with **no** invite APIs exposed in UI.
- Share one `sim/` rules package across both modes.
- Keep online play **server-authoritative**; keep offline play fully local during the match.

## 2. High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Client                            │
│  Sign-in → Create username (first time) → Menu (Offline | Online)│
│  Online → Singleplayer (solo queue) | Multiplayer (invites)      │
│  Render / Audio / Input                                          │
│       │                          │                               │
│       │ Offline                  │ Online                        │
│       ▼                          ▼                               │
│  Local Sim Host            Net Client (predict + reconcile)     │
│  (bots, pause, seed)         │                                   │
└───────┬──────────────────────┼───────────────────────────────────┘
        │ sync results         │ HTTPS / WS
        ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Backend                                │
│  Auth (OIDC: Google, Microsoft, Apple)                           │
│  API (profile, unlocks, match history, offline result ingest)    │
│  Matchmaker → Game Server Manager → Game Server (authoritative)  │
│  PostgreSQL + Redis                                              │
└─────────────────────────────────────────────────────────────────┘
```

Sign-in always needs internet. Offline matches do not use the game server. Online matches require API + matchmaker + game server connectivity.

## 3. Recommended stack (MVP)

| Layer | Choice | Rationale |
| --- | --- | --- |
| Client | TypeScript + Vite + Three.js | Shared types, fast web delivery |
| Auth | OIDC / OAuth 2.0 via Google, Microsoft, Apple | No passwords to store |
| Session | HTTP-only secure cookies or short-lived JWT + refresh | XSS-resistant preference: httpOnly cookie |
| Shared sim | `packages/sim` | Identical rules offline & online |
| Online net | WebSocket binary | Simple MVP transport |
| API / matchmaker | Node (TypeScript) | Speed to ship |
| Game server | Node or Rust hosting shared sim | Authority + bots |
| DB | PostgreSQL | Users, links, progression |
| Cache | Redis | Sessions, queues, rate limits |
| Tests | Vitest + fake clients | Sim + auth callback tests |

## 4. Authentication

### 4.1 Providers

| Provider | Protocol | Scopes (minimum) |
| --- | --- | --- |
| Google | OIDC | `openid email profile` |
| Microsoft | OIDC (MS identity platform) | `openid email profile` |
| Apple | Sign in with Apple (OIDC) | `name email` (name only on first authorize) |

### 4.2 Flow (authorization code + PKCE)

1. Client clicks provider → browser redirect or popup to IdP.
2. Callback to API `/auth/callback/:provider` with auth code.
3. API exchanges code, validates `id_token`, upserts `User` + `AuthIdentity`.
4. API establishes session (httpOnly Secure SameSite cookie recommended).
5. Client loads `/me`:
   - `401` → Sign in screen.
   - `200` with `username == null` → **Create username** screen (blocks menu).
   - `200` with username set → Main menu.

### 4.3 Username API

- `GET /usernames/availability?u=Name` → `{ available: boolean }` (auth required; rate-limited).
- `POST /me/username` `{ username }` → sets once; `409` if taken; `400` if invalid; `403` if already set (MVP).
- Canonical store: `username` (display casing as chosen) + `usernameNormalized` (lowercase) **unique**.

Validation (server-enforced, mirror on client):

- `^[A-Za-z][A-Za-z0-9_]{2,15}$`
- Profanity / reserved deny-list.

### 4.4 Route protection

- All game routes and API game endpoints require a valid session **and** a set username (except username create + availability).
- Public: Sign in page, legal pages, health checks, OAuth callbacks.
- WebSocket game join requires `joinToken` minted only for authenticated users with usernames.

### 4.5 Data model (auth + social)

```ts
User {
  id: uuid
  username: string | null          // null until first-time setup completes
  usernameNormalized: string | null // unique when set
  avatarUrl?: string
  createdAt, updatedAt
}

AuthIdentity {
  userId: uuid
  provider: 'google' | 'microsoft' | 'apple'
  providerSubject: string   // IdP `sub`
  email?: string            // may be Apple relay
  emailVerified?: boolean
  unique (provider, providerSubject)
}

Session {
  id, userId, createdAt, expiresAt, revokedAt?
}

Party {
  id: uuid
  leaderUserId: uuid
  region?: string
  createdAt, updatedAt
}

PartyMember {
  partyId, userId, ready: boolean, joinedAt
  unique (partyId, userId)
}

PartyInvite {
  id: uuid
  partyId: uuid
  fromUserId: uuid
  toUserId: uuid
  toUsernameNormalized: string
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
  createdAt, expiresAt
}

Friendship {  // optional same-MVP
  userId, friendUserId, status: 'pending' | 'accepted' | 'blocked'
}
```

MVP may skip multi-provider linking (one `AuthIdentity` → one `User`). If the same email appears on two providers, do **not** auto-merge without explicit user linking (post-MVP).

### 4.6 Apple specifics

- Handle missing email on subsequent logins; keep first-seen relay/email.
- Honor IdP name only as an optional username **suggestion** on first Create username screen.
- Register domains/return URLs per Apple/Google/Microsoft console requirements.

### 4.7 Sign out & deletion

- `POST /auth/logout` revokes session.
- Account deletion: soft-delete + schedule hard-delete; release username after grace period for reuse policy (document choice: never reuse vs reuse after N days).

## 5. Mode selection (client)

Main menu state machine:

```
SignedOut → (OAuth) → NeedsUsername → CreateUsername → Menu
SignedOut → (OAuth) → Menu          // returning user
Menu → setupOffline → OfflineMatch → Recap → Menu
Menu → setupOnline → chooseSingleplayer → Queue → OnlineMatch → Recap → Menu
Menu → setupOnline → chooseMultiplayer → PartyLobby → Queue → OnlineMatch → Recap → Menu
Menu → Practice → … → Menu
Menu → SignOut → SignedOut
```

UI: Offline/Online are primary CTAs; after Online, Singleplayer/Multiplayer are equally clear. Invite controls render **only** on the Multiplayer party lobby.

## 6. Offline runtime

- Instantiate `sim` in the client (or a Worker) as **LocalMatchHost**.
- Seeded RNG; bots run locally; Esc pauses (`simClock` frozen).
- On match end: build `MatchResultPayload` `{ mode: 'offline', seed, placement, elims, damage, duration, ... }` and `POST /matches/offline-results` when online.
- If POST fails: store in IndexedDB outbox; retry with backoff on next launch / reconnect.
- Never send MMR updates from offline results (API ignores / rejects mmr fields).

## 7. Online runtime

### 7.1 Services

- **API:** profile, username, invites, party, cosmetics, history, offline result ingest, matchmaking ticket.
- **Presence:** lightweight heartbeat (`PUT /me/presence`) → Redis; states: `menu` | `queue` | `match` | `offline`.
- **Matchmaker:** region + MMR queues; **party-aware** tickets; bot-fill plan; allocates game server; returns `joinToken` per member.
- **Game server:** authoritative tick; bots; replication; results → API (`mode: 'online'`).

### 7.2 Party & username invites (Online Multiplayer only)

- Party/invite endpoints are used only when `playMode === 'online_multiplayer'`.
- Online Singleplayer matchmaking tickets **must not** include a `partyId` (or party size must be 1 with no pending invites).
- Client **must not** show invite UI on Singleplayer; API should reject invites if the caller is flagged/queued as singleplayer (defense in depth).

Endpoints:

- `POST /parties` — create party (leader = caller); only from Multiplayer flow.
- `POST /parties/invites` `{ username }` — resolve username → create `PartyInvite`; notify target via websocket/SSE `invite` event.
- `POST /parties/invites/:id/accept` | `/decline`
- `POST /parties/:id/ready` `{ ready: true|false }`
- `DELETE /parties/:id/leave`
- Invite TTL: e.g. **60 seconds** while target in menu.
- Max party size: **4**.
- Only leader starts queue (`POST /matchmaking/ticket` with `partyId` + `queueType: 'multiplayer'`); all members must be `ready`.
- Online Singleplayer: `POST /matchmaking/ticket` with `queueType: 'singleplayer'` (no party).
- Matchmaker places a multiplayer party on the same server and same team id.
- Party MMR for bucketing: `max(member.mmr)` (simple, abuse-resistant enough for MVP).

### 7.3 Net model

- Server tick 20–30 Hz; client sends `InputFrame`; predicts movement/builds; reconciles.
- Lag compensation for hitscan within a bounded rewind window.
- Reconnect token 30–60s; else elimination.
- Esc does not pause.
- Kill feed / scoreboard show **username** (not OAuth email).

### 7.4 Messages (illustrative)

Client → Server: `input`, `buildPlace`, `emote`, `reconnect`  
Server → Client: `welcome`, `tickState`, `event`, `matchEnd`, `reject`  
API realtime (menu): `party_invite`, `party_update`, `presence_update`

Use binary encoding (e.g. MessagePack or custom bitpack) for tick state.

## 8. Shared simulation package

```
packages/sim/           # pure rules
packages/net-protocol/
apps/client/            # auth UI, username setup, menu, offline host, online net client, render
apps/server-api/        # OAuth, username, party invites, profile, offline ingest
apps/server-matchmaker/
apps/server-game/
```

Bots use the same `InputFrame` interface in both LocalMatchHost and game server.

## 9. Progression API rules

| Event | XP | MMR | Stats flags |
| --- | --- | --- | --- |
| Offline result (verified session) | Yes (possibly reduced rate) | No | `mode=offline` |
| Online result (from game server) | Yes | Yes | `mode=online` |

Anti-abuse (offline XP): rate-limit offline submits per user/day; reject impossible durations; optional checksum of seed + versioned sim hash (best-effort, not strong security).

## 10. Persistence

PostgreSQL: `User`, `AuthIdentity`, `Party`, `PartyMember`, `PartyInvite`, `Profile` (xp, mmr, unlocks, settings), `MatchResult`.  
Redis: sessions (optional), presence, matchmaking queues, join tokens, rate limits.  
IndexedDB (client): settings cache, offline result outbox, asset cache.

## 11. Security

- PKCE for all SPAs; validate ID token signatures and `aud` / `iss` / `nonce`.
- httpOnly cookies or carefully stored tokens; CSRF protection if cookie sessions.
- Server authority online; don’t trust client damage/XP.
- Rate-limit auth callbacks and offline result posts.
- Provider brand guidelines for buttons; HTTPS everywhere.

## 12. Performance budgets

| Budget | Target |
| --- | --- |
| Players per online match | 24 |
| Offline bots | up to 23 |
| Client frame time | ≤ 16.6ms avg mid laptop |
| Queue then bot fill | ≤ 45s |

## 13. Milestone plan

### M0 — Spec & skeleton

- Monorepo, OAuth stub screens, empty sim.

### M1 — Auth + username + Offline greybox

- Real Google/Microsoft/Apple login in dev.
- First-time username creation + uniqueness checks.
- Menu mode select; offline shoot/build/bots slice.

### M2 — Online Singleplayer + Multiplayer invites

- Online Singleplayer solo queue (no invite UI).
- Online Multiplayer: invite by username → party → same match.
- Matchmaker + bot fill for both queue types.

### M3 — Vertical slice both modes

- Full Solo BR offline & online; XP sync; sign out; legal links.

### M4+ — Squads, linking providers, practice polish, multi-region.

## 14. Testing

- OAuth callback unit tests (mock IdP tokens).
- Sim tests shared.
- Offline pause / outbox sync.
- Online: latency injection, reconnect, 24-player load.
- Manual: first-login username; Online Singleplayer has no invites; Multiplayer invite accept/decline; each OAuth provider; offline then online; sign out gate.

## 15. Risks

| Risk | Mitigation |
| --- | --- |
| Apple/Google/MS app review & setup | Configure consoles early in M1 |
| Offline XP farming | Caps + sim version binding |
| Scope creep | One map; no edits; 24 cap |
| Empty online queues | Bot fill SLA |
| Dual-path complexity | Shared `sim`; thin hosts |

## 16. Non-goals (tech MVP)

- Guest access
- Password accounts
- Peer-hosted primary online model
- Claiming strong anti-cheat on offline XP
