# AGENTS.md

## Cursor Cloud specific instructions

### Repository state
- The `main` branch is **specification only** (`README.md`, `CHANGELOG.md`, `docs/GAME_SPEC.md`, `docs/TECH_SPEC.md`). There is no application code, package manifest, or test suite on `main`, so there is nothing to build/run/test directly from `main`.
- The interactive greybox implementation lives under a top-level `demo/` directory (a Vite + TypeScript + Three.js single-page app). It is delivered on the `cursor/interactive-demo-ec4a` branch and may not be present on `main` until merged. All commands below assume a `demo/` directory exists.

### Toolchain
- Node.js and npm are pre-installed (Node 22.x). Vite 8 requires Node ≥ 22.12; the pre-installed version satisfies this.
- The demo uses plain **npm** (`demo/package-lock.json`); do not substitute another package manager.

### Running the demo (`demo/`)
- Install: `npm install --prefix demo` (or `cd demo && npm install`).
- Dev server: `cd demo && npm run dev` — serves on `http://localhost:5173/` (already bound to `0.0.0.0`).
- Typecheck + production build: `cd demo && npm run build` (runs `tsc` then `vite build`). This is the closest thing to a lint/typecheck gate — there is **no ESLint/Prettier config**, so `tsc` via the build script is the type-safety check.
- Preview a production build: `cd demo && npm run preview`.
- There are currently **no automated tests** (Vitest is planned in `docs/TECH_SPEC.md` but not yet present).

### App flow (for manual verification)
- OAuth is **stubbed** — clicking any provider button (Google/Microsoft/Apple) advances without a real account.
- Hello-world path: click a provider → type a username matching `^[A-Za-z][A-Za-z0-9_]{2,15}$` (e.g. `StormBuilder`) → Confirm → choose **Offline** (or **Online → Singleplayer**) to enter the 3D arena. Controls: WASD move, mouse aim, click to shoot, `B`/right-click build.
- **Multiplayer** is a UI preview only — it shows an alert and does not start a networked match yet.
