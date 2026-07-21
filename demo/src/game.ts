import * as THREE from "three";

export type GameEndReason = "victory" | "defeat";

export interface GameHooks {
  onHud: (state: HudState) => void;
  onEnd: (reason: GameEndReason, detail: string) => void;
}

export interface HudState {
  alive: number;
  total: number;
  materials: number;
  ammo: number;
  health: number;
  stormIn: number;
  phase: number;
}

const MAP = 80;
const PLAYER_SPEED = 14;
const BOT_SPEED = 9.5;
const BULLET_SPEED = 42;
const BUILD_COST = 10;
const START_MATS = 80;
const START_AMMO = 60;
const START_HP = 100;

interface Actor {
  mesh: THREE.Group;
  hp: number;
  alive: boolean;
  isPlayer: boolean;
  mats: number;
  ammo: number;
  cooldown: number;
  aim: THREE.Vector2;
  vel: THREE.Vector2;
}

interface Bullet {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  fromPlayer: boolean;
  life: number;
}

interface Wall {
  mesh: THREE.Mesh;
  hp: number;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export class ArenaGame {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private hooks: GameHooks;
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, down: false };
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pointer = new THREE.Vector2();
  private worldPoint = new THREE.Vector3();
  private player!: Actor;
  private bots: Actor[] = [];
  private bullets: Bullet[] = [];
  private walls: Wall[] = [];
  private stormRadius = 48;
  private targetStorm = 48;
  private stormTimer = 25;
  private phase = 1;
  private clock = new THREE.Clock();
  private running = false;
  private ended = false;
  private anim = 0;
  private totalPlayers = 0;
  private stormRing!: THREE.Mesh;
  private buildGhost!: THREE.Mesh;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp: () => void;
  private onContext: (e: Event) => void;
  private onResize: () => void;

  constructor(canvas: HTMLCanvasElement, hooks: GameHooks) {
    this.hooks = hooks;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;

    this.camera = new THREE.PerspectiveCamera(
      50,
      canvas.clientWidth / Math.max(canvas.clientHeight, 1),
      0.1,
      200,
    );
    this.camera.position.set(0, 28, 24);

    this.scene.background = new THREE.Color("#87b7c9");
    this.scene.fog = new THREE.Fog("#87b7c9", 55, 120);

    this.onKeyDown = (e) => {
      this.keys.add(e.code);
      if (["Space", "KeyB"].includes(e.code)) e.preventDefault();
      if (e.code === "KeyB" || e.code === "Space") this.tryBuild();
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    this.onMouseDown = (e) => {
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.tryBuild();
    };
    this.onMouseUp = () => {
      this.mouse.down = false;
    };
    this.onContext = (e) => e.preventDefault();
    this.onResize = () => this.resize();

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    canvas.addEventListener("contextmenu", this.onContext);
    window.addEventListener("resize", this.onResize);
  }

  start() {
    this.clearWorld();
    this.buildWorld();
    this.spawnActors();
    this.stormRadius = 48;
    this.targetStorm = 48;
    this.stormTimer = 22;
    this.phase = 1;
    this.ended = false;
    this.running = true;
    this.clock.start();
    this.tick();
    this.emitHud();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.anim);
  }

  dispose() {
    this.stop();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("resize", this.onResize);
    this.renderer.domElement.removeEventListener("mousemove", this.onMouseMove);
    this.renderer.domElement.removeEventListener("mousedown", this.onMouseDown);
    this.renderer.domElement.removeEventListener("contextmenu", this.onContext);
    this.clearWorld();
    this.renderer.dispose();
  }

  private resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = Math.max(canvas.clientHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private clearWorld() {
    while (this.scene.children.length) {
      const obj = this.scene.children[0];
      this.scene.remove(obj);
    }
    this.bots = [];
    this.bullets = [];
    this.walls = [];
  }

  private buildWorld() {
    const hemi = new THREE.HemisphereLight("#f7efe0", "#4a6b52", 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight("#fff2d8", 1.35);
    sun.position.set(20, 35, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP, MAP),
      new THREE.MeshStandardMaterial({
        color: "#c9b896",
        roughness: 0.95,
        metalness: 0.02,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(MAP, 40, "#8f7f63", "#b5a584");
    grid.position.y = 0.02;
    this.scene.add(grid);

    // Cover props
    for (let i = 0; i < 18; i++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(rand(1.4, 3.2), rand(1.2, 2.8), rand(1.4, 3.2)),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? "#6d7c86" : "#7a8f6e",
          roughness: 0.85,
        }),
      );
      box.position.set(rand(-32, 32), box.geometry.parameters.height / 2, rand(-32, 32));
      if (box.position.length() < 8) box.position.set(rand(12, 28), box.position.y, rand(-28, 28));
      box.castShadow = true;
      box.receiveShadow = true;
      this.scene.add(box);
      this.walls.push({ mesh: box, hp: 120 });
    }

    const ringGeo = new THREE.RingGeometry(47.5, 48.5, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: "#0f8f86",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    this.stormRing = new THREE.Mesh(ringGeo, ringMat);
    this.stormRing.rotation.x = -Math.PI / 2;
    this.stormRing.position.y = 0.08;
    this.scene.add(this.stormRing);

    this.buildGhost = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.2, 0.35),
      new THREE.MeshBasicMaterial({
        color: "#0f8f86",
        transparent: true,
        opacity: 0.35,
      }),
    );
    this.buildGhost.visible = false;
    this.scene.add(this.buildGhost);
  }

  private makeActor(color: string, isPlayer: boolean): Actor {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
    );
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 12),
      new THREE.MeshStandardMaterial({ color: "#f0d7b8", roughness: 0.6 }),
    );
    head.position.y = 1.95;
    head.castShadow = true;
    group.add(head);

    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.9),
      new THREE.MeshStandardMaterial({ color: "#2b333a", roughness: 0.4 }),
    );
    gun.position.set(0.35, 1.15, 0.45);
    group.add(gun);

    this.scene.add(group);
    return {
      mesh: group,
      hp: START_HP,
      alive: true,
      isPlayer,
      mats: isPlayer ? START_MATS : 40,
      ammo: isPlayer ? START_AMMO : 40,
      cooldown: 0,
      aim: new THREE.Vector2(0, 1),
      vel: new THREE.Vector2(),
    };
  }

  private spawnActors() {
    this.player = this.makeActor("#e08a2a", true);
    this.player.mesh.position.set(0, 0, 8);

    this.bots = [];
    const botColors = ["#c44536", "#3d6ea5", "#7a4e9a", "#2f8f5b", "#b45c2a", "#4a5560"];
    for (let i = 0; i < botColors.length; i++) {
      const bot = this.makeActor(botColors[i], false);
      const ang = (i / botColors.length) * Math.PI * 2;
      bot.mesh.position.set(Math.cos(ang) * 22, 0, Math.sin(ang) * 22);
      this.bots.push(bot);
    }
    this.totalPlayers = 1 + this.bots.length;
  }

  private tick = () => {
    if (!this.running) return;
    this.anim = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.ended) {
      this.updateAim();
      this.updatePlayer(dt);
      this.updateBots(dt);
      this.updateBullets(dt);
      this.updateStorm(dt);
      this.updateCamera(dt);
      this.updateGhost();
      this.checkEnd();
      this.emitHud();
    }
    this.renderer.render(this.scene, this.camera);
  };

  private updateAim() {
    this.pointer.set(this.mouse.x, this.mouse.y);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.ray.intersectPlane(this.groundPlane, this.worldPoint);
    const dx = this.worldPoint.x - this.player.mesh.position.x;
    const dz = this.worldPoint.z - this.player.mesh.position.z;
    if (dx * dx + dz * dz > 0.01) {
      this.player.aim.set(dx, dz).normalize();
      this.player.mesh.rotation.y = Math.atan2(this.player.aim.x, this.player.aim.y);
    }
  }

  private updatePlayer(dt: number) {
    if (!this.player.alive) return;
    const input = new THREE.Vector2(
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
        (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0),
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) -
        (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0),
    );
    if (input.lengthSq() > 0) input.normalize();
    this.player.mesh.position.x += input.x * PLAYER_SPEED * dt;
    this.player.mesh.position.z += input.y * PLAYER_SPEED * dt;
    this.clampActor(this.player);

    this.player.cooldown = Math.max(0, this.player.cooldown - dt);
    if (this.mouse.down) this.tryShoot(this.player);

    this.applyStormDamage(this.player, dt);
  }

  private updateBots(dt: number) {
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const target = this.player.alive ? this.player.mesh.position : null;
      const toCenter = new THREE.Vector2(-bot.mesh.position.x, -bot.mesh.position.z);
      const distCenter = Math.hypot(bot.mesh.position.x, bot.mesh.position.z);
      let move = new THREE.Vector2();

      if (distCenter > this.stormRadius - 4) {
        move.copy(toCenter).normalize();
      } else if (target) {
        const dx = target.x - bot.mesh.position.x;
        const dz = target.z - bot.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        bot.aim.set(dx, dz).normalize();
        bot.mesh.rotation.y = Math.atan2(bot.aim.x, bot.aim.y);
        if (dist > 10) move.set(dx, dz).normalize();
        else if (dist < 6) move.set(-dx, -dz).normalize();
        bot.cooldown = Math.max(0, bot.cooldown - dt);
        if (dist < 22 && Math.random() < 0.02) this.tryShoot(bot);
        if (bot.mats >= BUILD_COST && Math.random() < 0.004) {
          this.placeWall(bot.mesh.position.x + bot.aim.x * 2.2, bot.mesh.position.z + bot.aim.y * 2.2, bot);
        }
      } else {
        move.set(rand(-1, 1), rand(-1, 1)).normalize();
      }

      bot.mesh.position.x += move.x * BOT_SPEED * dt;
      bot.mesh.position.z += move.y * BOT_SPEED * dt;
      this.clampActor(bot);
      this.applyStormDamage(bot, dt);
    }
  }

  private tryShoot(actor: Actor) {
    if (!actor.alive || actor.cooldown > 0 || actor.ammo <= 0) return;
    actor.ammo -= 1;
    actor.cooldown = actor.isPlayer ? 0.18 : 0.35;
    const origin = actor.mesh.position.clone();
    origin.y = 1.2;
    const dir = new THREE.Vector3(actor.aim.x, 0, actor.aim.y).normalize();
    origin.addScaledVector(dir, 0.9);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 6),
      new THREE.MeshBasicMaterial({ color: actor.isPlayer ? "#f0c14b" : "#ff6b5a" }),
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.bullets.push({
      mesh,
      vel: dir.multiplyScalar(BULLET_SPEED),
      fromPlayer: actor.isPlayer,
      life: 1.4,
    });
  }

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      let hit = false;

      for (const wall of this.walls) {
        if (!wall.mesh.visible) continue;
        const d = b.mesh.position.distanceTo(wall.mesh.position);
        if (d < 1.6) {
          wall.hp -= 25;
          hit = true;
          if (wall.hp <= 0) {
            wall.mesh.visible = false;
            this.scene.remove(wall.mesh);
          }
          break;
        }
      }

      if (!hit) {
        const targets = b.fromPlayer ? this.bots : [this.player];
        for (const t of targets) {
          if (!t.alive) continue;
          const d = b.mesh.position.distanceTo(
            new THREE.Vector3(t.mesh.position.x, 1.1, t.mesh.position.z),
          );
          if (d < 0.9) {
            t.hp -= b.fromPlayer ? 22 : 14;
            hit = true;
            if (t.hp <= 0) this.kill(t);
            break;
          }
        }
      }

      if (hit || b.life <= 0 || Math.hypot(b.mesh.position.x, b.mesh.position.z) > MAP) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
  }

  private tryBuild() {
    if (!this.player.alive || this.player.mats < BUILD_COST) return;
    const x = this.player.mesh.position.x + this.player.aim.x * 2.4;
    const z = this.player.mesh.position.z + this.player.aim.y * 2.4;
    this.placeWall(x, z, this.player);
  }

  private placeWall(x: number, z: number, owner: Actor) {
    if (owner.mats < BUILD_COST) return;
    owner.mats -= BUILD_COST;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.2, 0.35),
      new THREE.MeshStandardMaterial({
        color: "#8d9aa3",
        roughness: 0.8,
        metalness: 0.05,
      }),
    );
    wall.position.set(x, 1.1, z);
    wall.rotation.y = Math.atan2(owner.aim.x, owner.aim.y);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.scene.add(wall);
    this.walls.push({ mesh: wall, hp: 90 });
  }

  private updateGhost() {
    if (!this.player?.alive) {
      this.buildGhost.visible = false;
      return;
    }
    this.buildGhost.visible = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    this.buildGhost.position.set(
      this.player.mesh.position.x + this.player.aim.x * 2.4,
      1.1,
      this.player.mesh.position.z + this.player.aim.y * 2.4,
    );
    this.buildGhost.rotation.y = Math.atan2(this.player.aim.x, this.player.aim.y);
  }

  private updateStorm(dt: number) {
    this.stormTimer -= dt;
    if (this.stormTimer <= 0) {
      this.phase += 1;
      this.targetStorm = Math.max(8, this.targetStorm - 10);
      this.stormTimer = Math.max(12, 24 - this.phase * 2);
    }
    this.stormRadius += (this.targetStorm - this.stormRadius) * Math.min(1, dt * 0.35);
    const s = Math.max(this.stormRadius, 0.5);
    this.stormRing.scale.set(s / 48, s / 48, 1);
    const mat = this.stormRing.material as THREE.MeshBasicMaterial;
    mat.color.set(this.phase > 3 ? "#c44536" : "#0f8f86");
  }

  private applyStormDamage(actor: Actor, dt: number) {
    const d = Math.hypot(actor.mesh.position.x, actor.mesh.position.z);
    if (d > this.stormRadius) {
      actor.hp -= (8 + this.phase * 3) * dt;
      if (actor.hp <= 0) this.kill(actor);
    }
  }

  private clampActor(actor: Actor) {
    const lim = MAP / 2 - 1;
    actor.mesh.position.x = clamp(actor.mesh.position.x, -lim, lim);
    actor.mesh.position.z = clamp(actor.mesh.position.z, -lim, lim);
  }

  private kill(actor: Actor) {
    if (!actor.alive) return;
    actor.alive = false;
    actor.hp = 0;
    actor.mesh.visible = false;
  }

  private aliveCount() {
    let n = this.player.alive ? 1 : 0;
    for (const b of this.bots) if (b.alive) n += 1;
    return n;
  }

  private checkEnd() {
    if (this.ended) return;
    if (!this.player.alive) {
      this.ended = true;
      this.hooks.onEnd("defeat", "The storm and the lobby got you. Try again.");
      return;
    }
    if (this.aliveCount() === 1) {
      this.ended = true;
      this.hooks.onEnd("victory", "Last one standing. Nice build fights.");
    }
  }

  private updateCamera(dt: number) {
    const target = new THREE.Vector3(
      this.player.mesh.position.x,
      26,
      this.player.mesh.position.z + 22,
    );
    this.camera.position.lerp(target, 1 - Math.pow(0.001, dt));
    this.camera.lookAt(
      this.player.mesh.position.x,
      0.5,
      this.player.mesh.position.z,
    );
  }

  private emitHud() {
    this.hooks.onHud({
      alive: this.aliveCount(),
      total: this.totalPlayers,
      materials: Math.max(0, Math.floor(this.player?.mats ?? 0)),
      ammo: Math.max(0, Math.floor(this.player?.ammo ?? 0)),
      health: Math.max(0, Math.ceil(this.player?.hp ?? 0)),
      stormIn: Math.max(0, Math.ceil(this.stormTimer)),
      phase: this.phase,
    });
  }
}
