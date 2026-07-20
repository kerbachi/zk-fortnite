# Game Specification — Web Battle Royale (Offline + Online)

## 1. Vision

A lightweight, browser-based battle royale that captures Fortnite-like fantasy: land on a shrinking map, loot weapons and materials, build cover, and be the last standing.

Players **must sign in** with **Google (Gmail), Microsoft, or Apple**, **create a unique player username on first login**, then **choose Offline or Online before each match**. If they choose **Online**, they then choose **Singleplayer** or **Multiplayer**. Friend invites by username are available **only in Online Multiplayer**.

Working title / repo: **zk-fortnite** (https://github.com/kerbachi/zk-fortnite).

## 2. Design pillars

| Pillar | Meaning |
| --- | --- |
| Signed-in access | The web app is usable only after OAuth with Google, Microsoft, or Apple. |
| Chosen identity | First login requires creating a unique in-game **username** used everywhere (HUD, kill feed, invites). |
| Mode per match | Offline vs Online is chosen every time; Online further splits into Singleplayer vs Multiplayer. |
| Invites only in multiplayer | Username party invites appear only after **Online → Multiplayer**. Online Singleplayer has no invite UI. |
| Shared rules | Same weapons, building, storm, and map feel in both modes; only networking and opponents differ. |
| Readable combat | Prefer clarity over simulation depth. |
| Building as skill expression | Building is a combat tool (cover, high ground), not a freeform city builder. |
| Short sessions | Target match length 8–15 minutes. |
| Fair online play | Online matches are server-authoritative; bots fill thin lobbies. |

## 3. Platforms & constraints

- **Primary:** Desktop browser (Chrome, Firefox, Edge, Safari recent).
- **Secondary:** Tablet / touch (simplified controls).
- **Delivery:** Hosted web app + regional game servers (for Online).
- **Auth:** Google, Microsoft, and Apple Sign In only (no email/password, no guest).
- **Non-goals for MVP:** console ports, 100-player BR, UGC, live battle-pass seasons, Fortnite IP.

## 4. Authentication & account gate

### 4.1 Requirement

- Unauthenticated users see a **Sign in** screen only (branding + three provider buttons).
- No gameplay, cosmetics browser, or practice range until signed in **and** a username is set.
- Session persists across visits (refresh token / secure cookie) until sign-out or revocation.

### 4.2 Providers (MVP)

| Provider | User-facing label | Notes |
| --- | --- | --- |
| Google | Continue with Google | Covers Gmail / Google accounts |
| Microsoft | Continue with Microsoft | Personal or work/school MSA as supported by app registration |
| Apple | Continue with Apple | Includes Hide My Email; store relay email if provided |

### 4.3 First-time username creation

On the **first successful OAuth login**, if the account has no username yet, the user is forced through a **Create username** screen before the main menu.

Rules:

- Username is the public player name (invites, party list, kill feed, scoreboard).
- **Unique** across all players (case-insensitive uniqueness; store a canonical lowercase key).
- Length: **3–16** characters.
- Allowed: letters, numbers, underscore; must start with a letter.
- Block reserved / profane / Impersonation-sensitive names via a moderation list.
- Live availability check (`username available` / `taken`) before Confirm.
- Confirm is permanent for MVP except via rare support rename; settings may show username as read-only.
- Provider display names are **not** used as the in-game username (optional prefill suggestion only, editable).

Returning users with a username skip this step and go straight to the main menu.

### 4.4 Account model

- One game profile per OAuth identity; allow **account linking** later if the same person uses two providers (post-MVP OK; MVP: separate profiles per provider is acceptable if documented).
- Sign out available from settings; signing out returns to the Sign in screen.
- Delete account / data export: required for store/privacy compliance (MVP: support request flow minimum; self-serve preferred).

### 4.5 Age & compliance

- Collect only what providers share + game username/profile fields.
- Privacy policy and terms linked on the Sign in screen.
- Target Teen rating (fantasy violence).

## 5. Pre-match mode select

After sign-in **and** username creation, the main menu always presents:

```
[ Play Offline ]    [ Play Online ]
```

**Play Online** opens a second choice:

```
[ Singleplayer ]    [ Multiplayer ]
```

| Path | What it means | Invites |
| --- | --- | --- |
| Offline | Local match vs bots | No |
| Online → Singleplayer | Queue alone into an online match (humans + bot fill) | **No** — invite UI hidden |
| Online → Multiplayer | Create/join a party, invite friends by username, then queue together | **Yes** |

Returning from a finished match lands on the main menu again so the player can pick Offline/Online (and Singleplayer/Multiplayer) anew.

| | Offline | Online Singleplayer | Online Multiplayer |
| --- | --- | --- | --- |
| Opponents | AI bots only | Real players + bot fill | Real players + bot fill |
| Party | — | Always alone (party size 1) | Party of 2–4 via username invites |
| Network during match | Not required after assets/auth session are available* | Required | Required |
| Authority | Local simulation | Server-authoritative | Server-authoritative |
| Pause | Allowed (freezes sim) | Not allowed | Not allowed |
| Progression | XP/stats; tagged offline | XP/stats + MMR | XP/stats + MMR |
| Setup options | Bot count, difficulty | Region, ping, Queue | Region, **Invite by username**, Ready, Queue |

\*Initial load and sign-in need internet. After sign-in, Offline can proceed if the client and assets are already loaded; if the auth session must refresh and the network is down, show a clear error and offer retry (do not soft-enter without a valid session).

## 6. Modes

### 6.1 Offline Solo (MVP)

- 1 human + N bots (default **23** → 24 total; configurable 8 / 16 / 24).
- Same BR rules: drop, loot, storm, build, fight.
- Starts from local lobby countdown (skippable).
- Esc **pauses** the simulation.

### 6.2 Online Singleplayer (MVP)

- Player chose **Play Online → Singleplayer**.
- Queues **alone** (no party, no invite controls on this screen).
- Up to **24** players in the match (other humans via matchmaking + bot fill).
- Matchmaking by region + MMR band.
- Bot fill if underfilled within ~30–45s.
- Esc does **not** pause; confirm to leave.
- Disconnect → reconnect window (30–60s) or elimination.

### 6.3 Online Multiplayer (MVP)

- Player chose **Play Online → Multiplayer**.
- Opens the **party lobby** where inviting friends **by username** is available.
- Max party size: **4**. Leader invites; members Ready; leader queues.
- Whole party is placed on the same game server and same team (friendly fire off within party; drop/spawn together).
- Matchmaking uses party MMR rule (see Tech Spec); bot fill still applies to empty lobby slots.
- Same live-match rules as Online Singleplayer (no pause, reconnect window).

### 6.4 Online Multiplayer invites by username (MVP)

Shown **only** on the Online Multiplayer party screen (never on Offline or Online Singleplayer):

1. Player types a friend’s **exact username** and clicks **Invite**.
2. System looks up the username (case-insensitive).
3. If found and eligible, the friend receives an **invite notification** (in-app while online).
4. Friend **Accepts** → joins the inviter’s party. **Declines** / timeout → invite expires.
5. Party leader queues when all members are Ready.

Invite eligibility / errors (user-facing):

| Case | Message |
| --- | --- |
| Unknown username | Player not found |
| Inviting yourself | That’s you |
| Target offline / not in menu | Player unavailable (or “invite sent — they’ll see it when online” if presence allows queued invites) |
| Target already in a match | Player is in a match |
| Party full | Party is full |
| Already in party | Already in your party |
| Blocked (either direction) | Unable to invite |

MVP presence: at least “Online in menu”, “In queue”, “In match”, “Offline”. Invites succeed when target is Online in menu (required); queued invites for offline users are optional MVP+.

Helpers:

- **Recent players** / **recent invitees** for quick re-invite.
- Optional lasting friends list: `Add friend` by username + accept.

### 6.5 Online Squads polish (Post-MVP)

- Dedicated Duos/Squads playlists, pings UI, revive, party chat.

### 6.6 Practice Range (MVP)

- Reachable from the main menu (still requires sign-in + username).
- Prefer **online instanced range**; if unavailable, fall back to **local offline range**.
- Infinite materials toggle, weapon spawner, respawn.

### 6.7 Custom lobbies (Post-MVP)

- Invite codes, rule toggles, optional bot fill.

## 7. Core loop

```
Sign in (Google / Microsoft / Apple)
  → (First time only) Create username
  → Main menu
  → Choose Offline or Online
       Offline → bot setup → match
       Online → Choose Singleplayer or Multiplayer
            Singleplayer → region → queue alone (no invites)
            Multiplayer → invite friends by username → party Ready → queue
  → Match (drop → loot → fight/build → storm → end)
  → Recap
  → Main menu (choose again)
```

## 8. Player fantasy & controls (desktop MVP)

### Camera

- Third-person over-the-shoulder.
- Optional shoulder swap; otherwise fixed.

### Actions

| Input (default) | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look / aim |
| Left click | Fire / place build |
| Right click | ADS / alternate build piece |
| R | Reload |
| 1–5 / scroll | Hotbar |
| Build keys | Wall / Floor / Stairs / Roof |
| F | Interact |
| Shift | Sprint |
| Ctrl / C | Crouch |
| Space | Jump |
| G | Pickaxe / harvest |
| Tab | Inventory |
| Esc | Offline: pause menu · Online: live menu (no pause) |
| M | Map |

## 9. Systems

### 9.1 Health & survival

- Max HP 100; shield 0–100; fall damage; escalating storm.
- Solo MVP: no downed state (elim at 0 HP).

### 9.2 Weapons & combat

| Class | Role |
| --- | --- |
| Assault rifle | Mid-range default |
| Shotgun | Close build fights |
| SMG | Close-mid spray |
| Sniper (rare) | Long picks |
| Pistol | Early / backup |
| Pickaxe | Harvest + weak melee |

Rarities: Common → Legendary. Online: server validates hits and damage. Offline: same rules run locally.

### 9.3 Loot

- Floor loot + chests; materials wood/stone/metal; 5 hotbar slots.
- Online: server-authoritative loot. Offline: seeded local RNG.

### 9.4 Building

- Pieces: Wall, Floor, Stairs, Roof.
- Grid snap; turbo build; no freeform edit in MVP.
- Online: client predicts, server confirms. Offline: local authority.

### 9.5 Storm / zone

- Phased shrink + damage curve; identical tuning in both modes.
- Online: server owns schedule. Offline: local sim.

### 9.6 Map (MVP)

- One medium map for ~24 players; 6–8 POIs; original art/names only.

### 9.7 Bots

- Offline: entire lobby except the player.
- Online: fill only; same imperfect aim / build panic behavior by difficulty.
- Offline setup exposes difficulty presets: Recruit / Regular / Hard.

### 9.8 Progression

- Profile stored **server-side** (tied to OAuth account).
- Both modes grant XP; match results tagged `offline` | `online`.
- MMR changes **online only**.
- Cosmetics unlock from XP/catalog; usable in both modes once unlocked.
- If Offline finishes while briefly offline from API: queue result and sync on next successful connection (show “syncing…”); never invent online MMR offline.

### 9.9 Audio / juice

- Weapons, footsteps, storm, builds, chests, victory, hit markers, kill feed.

## 10. Match flow details

### Offline

1. Play Offline → bot count + difficulty → Start.
2. Local countdown → drop → match.
3. Death: spectate / rematch / menu. Win: victory → rematch / menu.
4. Pause freezes sim; Leave confirm → menu.

### Online Singleplayer

1. Play Online → **Singleplayer** → region → Queue (alone).
2. Match found → connect → countdown → match.
3. No invite UI on this path.

### Online Multiplayer

1. Play Online → **Multiplayer** → Invite by username → party Ready → region → Queue.
2. Match found → all party members connect to the same game server → countdown.
3. Death: spectate → menu or wait for XP. Win / end → results → menu.
4. Reconnect token 30–60s on drop.

## 11. MVP success criteria

1. User cannot enter the menu without Google, Microsoft, or Apple sign-in.
2. First login requires creating a **unique username** before the menu; second login skips that step.
3. From the menu, user can start **Offline** and complete a bot match.
4. **Online → Singleplayer** queues alone with **no** invite controls, and completes a live match (bot fill OK).
5. **Online → Multiplayer** can invite another player by username, form a party, queue together, and land in the same match.
6. After any match, user returns to menu and can pick a different path (Offline / Online Singleplayer / Online Multiplayer).
7. XP/unlocks persist; username shown in kill feed / scoreboard.
8. Sign out returns to the Sign in screen.

## 12. Explicit non-goals (MVP)

- Guest / anonymous play
- Email + password accounts
- 100-player matches, Creative/UGC, full edit fighting
- Vehicles, voice chat
- Fortnite assets or trademarks

## 13. Content & legal

- Original art, audio, names, UI.
- OAuth provider brand guidelines for buttons.
- Privacy policy covering OAuth data, match logs, anti-cheat telemetry (online).

## 14. Open decisions

1. Account linking across Google/Microsoft/Apple in MVP vs later.
2. Username rename policy (support-only vs one free rename).
3. Whether offline users can receive delayed multiplayer invites.
4. Online Multiplayer party = shared team inside a BR lobby vs dedicated Squads playlist day one.
5. WebSocket vs WebRTC for online transport.
6. Server tick 20 vs 30 Hz.
7. Offline result sync conflict policy if two devices play offline.
