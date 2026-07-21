# zk-fortnite

Browser battle-royale game inspired by Fortnite’s core loop — drop, loot, build, fight, survive — with **Offline or Online** chosen before each match, and **Online** further split into **Singleplayer** vs **Multiplayer**.

**Repository:** https://github.com/kerbachi/zk-fortnite

## Pillars

1. **Social sign-in** — Google (Gmail), Microsoft, or Apple.
2. **Username on first login** — unique in-game name for HUD, kill feed, and invites.
3. **Mode choice** — Offline, or Online → Singleplayer / Multiplayer.
4. **Invites only in Multiplayer** — friends invited by username only after Online → Multiplayer.
5. **Build + shoot** — third-person combat with simple building.

## Docs

| Document | Purpose |
| --- | --- |
| [docs/GAME_SPEC.md](docs/GAME_SPEC.md) | Game design, auth, modes, invites |
| [docs/TECH_SPEC.md](docs/TECH_SPEC.md) | OAuth, queues, party APIs, client/server |

## Status

Specification complete. Interactive **greybox demo** available under [`demo/`](demo/) (menu flow + offline arena).

## Interactive demo

```bash
cd demo
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`). Stub sign-in → username → Offline (or Online Singleplayer) to play: WASD move, mouse aim, click shoot, `B` / right-click build, storm shrinks.

## Play flow (summary)

1. Sign in with Google, Microsoft, or Apple.
2. **First time only:** create a unique player username.
3. Choose **Offline** or **Online**.
4. If Online → choose **Singleplayer** (queue alone, no invites) or **Multiplayer** (invite by username → party → queue).
5. After the match → menu → choose again.

## Local development

```bash
git clone https://github.com/kerbachi/zk-fortnite.git
cd zk-fortnite/demo
npm install
npm run dev
# later: API, auth, matchmaking, authoritative game servers
```
