import "./style.css";
import { ArenaGame, type GameEndReason, type HudState } from "./game";

type ScreenId = "signin" | "username" | "mode" | "online" | "game";

const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,15}$/;
const reserved = new Set(["admin", "system", "fortnite", "epic", "mod"]);

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="screen active" id="screen-signin">
    <div class="screen-bg" aria-hidden="true"></div>
    <div class="panel">
      <h1 class="brand">zk-<span>fortnite</span></h1>
      <p class="lede">Drop, loot, build, fight, survive — interactive greybox demo.</p>
      <div class="stack">
        <button class="btn" data-provider="google"><span class="provider-dot google"></span>Continue with Google</button>
        <button class="btn" data-provider="microsoft"><span class="provider-dot microsoft"></span>Continue with Microsoft</button>
        <button class="btn" data-provider="apple"><span class="provider-dot apple"></span>Continue with Apple</button>
      </div>
      <p class="demo-note">Demo stubs OAuth — no real accounts. Spec flow only.</p>
    </div>
  </div>

  <div class="screen" id="screen-username">
    <div class="screen-bg" aria-hidden="true"></div>
    <div class="panel">
      <h1 class="brand">zk-<span>fortnite</span></h1>
      <p class="lede">First login: create a unique in-game username.</p>
      <div class="stack">
        <div class="field">
          <label for="username">Username</label>
          <input id="username" maxlength="16" autocomplete="off" placeholder="e.g. StormBuilder" />
          <p class="hint" id="username-hint">3–16 chars, start with a letter.</p>
        </div>
        <button class="btn btn-primary" id="confirm-username" disabled>Confirm username</button>
      </div>
    </div>
  </div>

  <div class="screen" id="screen-mode">
    <div class="screen-bg" aria-hidden="true"></div>
    <div class="panel">
      <h1 class="brand">zk-<span>fortnite</span></h1>
      <p class="lede">Welcome, <strong id="player-name">Player</strong>. Choose a mode for this match.</p>
      <div class="mode-grid stack">
        <button class="mode-option" id="play-offline">
          <h3>Offline</h3>
          <p>Local sim with bots. Pause anytime. Playable in this demo.</p>
        </button>
        <button class="mode-option" id="play-online">
          <h3>Online</h3>
          <p>Singleplayer solo queue or Multiplayer invites — UI preview.</p>
        </button>
      </div>
      <button class="btn btn-ghost" id="sign-out" style="margin-top:1rem">Sign out</button>
    </div>
  </div>

  <div class="screen" id="screen-online">
    <div class="screen-bg" aria-hidden="true"></div>
    <div class="panel">
      <h1 class="brand">zk-<span>fortnite</span></h1>
      <p class="lede">Online path from the spec.</p>
      <div class="mode-grid stack">
        <button class="mode-option" id="online-solo">
          <h3>Singleplayer</h3>
          <p>Solo queue. No invites. Demo opens the same offline arena.</p>
        </button>
        <button class="mode-option" id="online-multi">
          <h3>Multiplayer</h3>
          <p>Invite by username → party → queue. Preview only for now.</p>
        </button>
      </div>
      <button class="btn btn-ghost" id="back-mode" style="margin-top:1rem">Back</button>
    </div>
  </div>

  <div id="game-root">
    <canvas id="game-canvas"></canvas>
    <div class="hud">
      <div class="hud-top">
        <div class="hud-pill">
          <span>Alive <strong id="hud-alive">7</strong></span>
          <span>Mats <strong id="hud-mats">80</strong></span>
          <span>Ammo <strong id="hud-ammo">60</strong></span>
        </div>
        <div class="hud-center">Storm in <span id="hud-storm">22</span>s · P<span id="hud-phase">1</span></div>
      </div>
      <div class="hud-bottom">
        <div class="bars">
          <div class="bar-row">
            <span>HP</span>
            <div class="bar-track"><div class="bar-fill hp" id="hp-fill"></div></div>
            <span id="hud-hp">100</span>
          </div>
          <div class="bar-row">
            <span>Mats</span>
            <div class="bar-track"><div class="bar-fill mat" id="mat-fill"></div></div>
            <span id="hud-mats2">80</span>
          </div>
        </div>
        <div class="controls-help">
          <div><kbd>WASD</kbd> move · mouse aim</div>
          <div><kbd>Click</kbd> shoot · <kbd>B</kbd>/<kbd>RMB</kbd> build</div>
          <div><kbd>Shift</kbd> ghost wall</div>
        </div>
      </div>
    </div>
    <div class="overlay-msg" id="end-overlay">
      <div class="overlay-card">
        <h2 id="end-title">Victory</h2>
        <p id="end-detail"></p>
        <button class="btn btn-primary" id="back-menu">Back to menu</button>
      </div>
    </div>
  </div>
`;

const screens: Record<ScreenId, HTMLElement> = {
  signin: document.getElementById("screen-signin")!,
  username: document.getElementById("screen-username")!,
  mode: document.getElementById("screen-mode")!,
  online: document.getElementById("screen-online")!,
  game: document.getElementById("game-root")!,
};

const usernameInput = document.getElementById("username") as HTMLInputElement;
const usernameHint = document.getElementById("username-hint")!;
const confirmUsername = document.getElementById("confirm-username") as HTMLButtonElement;
const playerNameEl = document.getElementById("player-name")!;
const endOverlay = document.getElementById("end-overlay")!;
const endTitle = document.getElementById("end-title")!;
const endDetail = document.getElementById("end-detail")!;
const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;

let username = "";
let game: ArenaGame | null = null;

function show(id: ScreenId) {
  (Object.keys(screens) as ScreenId[]).forEach((key) => {
    screens[key].classList.toggle("active", key === id);
  });
}

function validateUsername(value: string) {
  if (!value) return { ok: false, msg: "3–16 chars, start with a letter." };
  if (!USERNAME_RE.test(value)) return { ok: false, msg: "Invalid format." };
  if (reserved.has(value.toLowerCase())) return { ok: false, msg: "That name is reserved." };
  return { ok: true, msg: "Available in this demo." };
}

usernameInput.addEventListener("input", () => {
  const result = validateUsername(usernameInput.value.trim());
  usernameHint.textContent = result.msg;
  usernameHint.className = `hint ${result.ok ? "ok" : valueEmpty(usernameInput.value) ? "" : "bad"}`;
  confirmUsername.disabled = !result.ok;
});

function valueEmpty(v: string) {
  return v.trim().length === 0;
}

document.querySelectorAll<HTMLButtonElement>("[data-provider]").forEach((btn) => {
  btn.addEventListener("click", () => show("username"));
});

confirmUsername.addEventListener("click", () => {
  const value = usernameInput.value.trim();
  const result = validateUsername(value);
  if (!result.ok) return;
  username = value;
  playerNameEl.textContent = username;
  show("mode");
});

document.getElementById("sign-out")!.addEventListener("click", () => {
  username = "";
  usernameInput.value = "";
  confirmUsername.disabled = true;
  usernameHint.textContent = "3–16 chars, start with a letter.";
  usernameHint.className = "hint";
  show("signin");
});

document.getElementById("play-offline")!.addEventListener("click", () => startMatch());
document.getElementById("play-online")!.addEventListener("click", () => show("online"));
document.getElementById("back-mode")!.addEventListener("click", () => show("mode"));
document.getElementById("online-solo")!.addEventListener("click", () => startMatch());
document.getElementById("online-multi")!.addEventListener("click", () => {
  alert(
    "Multiplayer invites are specified (invite by username → party → queue) but not networked in this greybox yet. Try Offline or Online Singleplayer.",
  );
});

document.getElementById("back-menu")!.addEventListener("click", () => {
  endOverlay.classList.remove("visible");
  game?.stop();
  game?.dispose();
  game = null;
  show("mode");
});

function onHud(state: HudState) {
  document.getElementById("hud-alive")!.textContent = String(state.alive);
  document.getElementById("hud-mats")!.textContent = String(state.materials);
  document.getElementById("hud-mats2")!.textContent = String(state.materials);
  document.getElementById("hud-ammo")!.textContent = String(state.ammo);
  document.getElementById("hud-hp")!.textContent = String(state.health);
  document.getElementById("hud-storm")!.textContent = String(state.stormIn);
  document.getElementById("hud-phase")!.textContent = String(state.phase);
  (document.getElementById("hp-fill") as HTMLElement).style.transform =
    `scaleX(${Math.max(0, state.health / 100)})`;
  (document.getElementById("mat-fill") as HTMLElement).style.transform =
    `scaleX(${Math.max(0, Math.min(1, state.materials / 80))})`;
}

function onEnd(reason: GameEndReason, detail: string) {
  endTitle.textContent = reason === "victory" ? "Victory Royale" : "Eliminated";
  endDetail.textContent = detail;
  endOverlay.classList.add("visible");
}

function startMatch() {
  endOverlay.classList.remove("visible");
  show("game");
  // Ensure layout sizes canvas before WebGL init
  requestAnimationFrame(() => {
    game?.dispose();
    game = new ArenaGame(canvas, { onHud, onEnd });
    game.start();
  });
}
