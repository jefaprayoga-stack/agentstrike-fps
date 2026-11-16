// AGENTSTRIKE — three.js FPS engine: map, player, bots, weapons, skills, match flow.
import * as THREE from 'three';
import { getAgent, getWeapon, getSkin, BOT_NAMES } from './data.js';

// ---------------------------------------------------------------- audio (synth only, no files)
class AudioSys {
  constructor() { this.ctx = null; }
  ensure() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { /* audio unavailable */ }
    return this.ctx;
  }
  tone(freq, dur, type = 'sine', gain = 0.08, when = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }
  shoot() { this.tone(180 + Math.random() * 60, 0.09, 'square', 0.05); }
  hit() { this.tone(880, 0.06, 'sine', 0.07); }
  kill() { this.tone(660, 0.08, 'sine', 0.09); this.tone(990, 0.12, 'sine', 0.09, 0.08); }
  roundWin() { this.tone(523, 0.12, 'sine', 0.09); this.tone(659, 0.12, 'sine', 0.09, 0.12); this.tone(784, 0.2, 'sine', 0.09, 0.24); }
  hurt() { this.tone(120, 0.12, 'sawtooth', 0.06); }
}

// ---------------------------------------------------------------- map
const ARENA = { x: 30, z: 20 };
const WALL_DEFS = [
  // perimeter
  { x: 0, z: -21, w: 64, d: 2, h: 5 }, { x: 0, z: 21, w: 64, d: 2, h: 5 },
  { x: -31, z: 0, w: 2, d: 44, h: 5 }, { x: 31, z: 0, w: 2, d: 44, h: 5 },
  // mid wall, two segments with a center gap
  { x: 0, z: -9, w: 2, d: 10, h: 3.4 }, { x: 0, z: 9, w: 2, d: 10, h: 3.4 },
  // crates
  { x: -12, z: -8, w: 2, d: 2, h: 1.2 }, { x: -12, z: 8, w: 2, d: 2, h: 1.2 },
  { x: 12, z: -8, w: 2, d: 2, h: 1.2 }, { x: 12, z: 8, w: 2, d: 2, h: 1.2 },
  { x: -20, z: 0, w: 3, d: 2, h: 1.5 }, { x: 20, z: 0, w: 3, d: 2, h: 1.5 },
  { x: 0, z: -15, w: 4, d: 2, h: 1.2 }, { x: 0, z: 15, w: 4, d: 2, h: 1.2 },
  // site blocks
  { x: -24, z: -14, w: 4, d: 3, h: 2.5 }, { x: 24, z: 14, w: 4, d: 3, h: 2.5 },
];

// Mid gaps bots route through when the direct path is blocked by the mid wall.
const GAPS = [
  { x: 0, z: 0 },
  { x: 0, z: -17 },
  { x: 0, z: 17 },
];

function collideCircle(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        const pl = pos.x - c.minX, pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
}

function segmentHitsSphere(a, b, center, radius) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(center, a);
  const len2 = ab.lengthSq();
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ac.dot(ab) / len2));
  const closest = new THREE.Vector3().copy(a).addScaledVector(ab, t);
  return closest.distanceTo(center) < radius;
}

// ---------------------------------------------------------------- bot
let botCounter = 0;
class Bot {
  constructor(scene, { name, team, spawn, hp, color }) {
    this.id = `bot-${botCounter++}`;
    this.name = name;
    this.team = team; // 'ally' | 'enemy'
    this.maxHp = hp;
    this.hp = hp;
    this.alive = true;
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.yaw = team === 'ally' ? -Math.PI / 2 : Math.PI / 2;
    this.speed = 4.1 + Math.random() * 0.5;
    this.nextThink = 0;
    this.nextShot = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeUntil = 0;
    this.wander = new THREE.Vector3((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 14);
    this.kills = 0;
    this.deaths = 0;
    this.gapIndex = 0; // assigned by spawnBots: which mid gap this bot prefers
    this.navTarget = null; // waypoint when the direct path is blocked
    this.lastPos = this.pos.clone();
    this.lastMoveCheck = 0;
    this.spawnX = spawn.x;
    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1d24 });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const add = (geo, mat, x, y, z, part) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.userData.botId = this.id;
      if (part) m.userData.part = part;
      this.group.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(0.5, 0.7, 0.34), darkMat, 0, 0.35, 0, 'body'); // legs
    this.torso = add(new THREE.BoxGeometry(0.62, 0.72, 0.4), bodyMat, 0, 1.06, 0, 'body');
    this.head = add(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat, 0, 1.68, 0, 'head');
    add(new THREE.BoxGeometry(0.46, 0.12, 0.46), bodyMat, 0, 1.92, 0, 'head'); // cap
    add(new THREE.BoxGeometry(0.1, 0.1, 0.7), darkMat, 0.2, 1.15, 0.45, 'body'); // gun
    // health bar
    this.barGroup = new THREE.Group();
    this.barGroup.position.set(0, 2.25, 0);
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.8, depthTest: false })
    );
    this.barFg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.06),
      new THREE.MeshBasicMaterial({ color: team === 'ally' ? 0x35a7ff : 0xff4655, transparent: true, opacity: 0.95, depthTest: false })
    );
    this.barFg.position.z = 0.01;
    this.barGroup.add(bg, this.barFg);
    this.barGroup.renderOrder = 999;
    this.group.add(this.barGroup);
    // name sprite
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = team === 'ally' ? '#7ec8ff' : '#ff8a94';
    ctx.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(1.5, 0.28, 1);
    sprite.position.set(0, 2.55, 0);
    sprite.renderOrder = 999;
    this.group.add(sprite);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    scene.add(this.group);
  }
  setHpBar() {
    const f = Math.max(0, this.hp / this.maxHp);
    this.barFg.scale.x = f;
    this.barFg.position.x = -0.43 * (1 - f);
  }
  takeDamage(dmg) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.setHpBar();
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.group.visible = false;
      return true;
    }
    return false;
  }
  respawn(spawn) {
    this.hp = this.maxHp;
    this.alive = true;
    this.pos.set(spawn.x, 0, spawn.z);
    this.group.position.copy(this.pos);
    this.group.visible = true;
    this.setHpBar();
  }
  dispose(scene) {
    scene.remove(this.group);
  }
}

// ---------------------------------------------------------------- game
export class Game {
  constructor(container, cb) {
    this.container = container;
    this.cb = cb; // { hud, killfeed, roundEnd, matchEnd, playerDied, playerRespawned }
    this.audio = new AudioSys();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 45, 110);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 200);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.running = false;
    this.disposed = false;
    this.buildWorld();
    this.bindInput();
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  buildWorld() {
    const scene = this.scene;
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1410, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    sun.position.set(20, 30, 10);
    scene.add(sun);
    // floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.x * 2 + 4, ARENA.z * 2 + 4),
      new THREE.MeshLambertMaterial({ color: 0x232833 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    // grid lines for orientation
    const grid = new THREE.GridHelper(64, 32, 0x3a4252, 0x2a3040);
    grid.position.y = 0.01;
    scene.add(grid);
    // walls / crates
    this.colliders = [];
    this.wallMeshes = [];
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x4a5160 });
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
    const siteMatA = new THREE.MeshLambertMaterial({ color: 0x2e6db4 });
    const siteMatB = new THREE.MeshLambertMaterial({ color: 0xb42e3e });
    WALL_DEFS.forEach((w, i) => {
      const isSite = i >= WALL_DEFS.length - 2;
      const mat = isSite ? (i === WALL_DEFS.length - 2 ? siteMatA : siteMatB)
        : w.h > 3 ? wallMat : crateMat;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), mat);
      mesh.position.set(w.x, w.h / 2, w.z);
      scene.add(mesh);
      this.wallMeshes.push(mesh);
      this.colliders.push({
        minX: w.x - w.w / 2, maxX: w.x + w.w / 2,
        minZ: w.z - w.d / 2, maxZ: w.z + w.d / 2,
      });
    });
    // site markers (floating letters)
    const mkLabel = (text, x, z, color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 90px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(text, 64, 90);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
      sprite.scale.set(3, 3, 1);
      sprite.position.set(x, 5, z);
      scene.add(sprite);
    };
    mkLabel('A', -24, -14, '#7ec8ff');
    mkLabel('B', 24, 14, '#ff8a94');
    // muzzle light (reused)
    this.muzzleLight = new THREE.PointLight(0xffc266, 0, 12);
    scene.add(this.muzzleLight);
    this.tracers = [];
    this.particles = [];
    this.smokes = [];
  }

  // ---------------------------------------------------------- input
  bindInput() {
    this.keys = {};
    this.mouseDown = false;
    this.yaw = 0;
    this.pitch = 0;
    this.onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (!this.match) return;
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'KeyQ') this.useSkill();
      if (e.code === 'Digit1') this.switchWeapon(0);
      if (e.code === 'Digit2') this.switchWeapon(1);
      if (e.code === 'Space') e.preventDefault();
    };
    this.onKeyUp = (e) => { this.keys[e.code] = false; };
    this.onMouseMove = (e) => {
      if (document.pointerLockElement !== this.renderer.domElement) return;
      if (!this.match || this.phase !== 'live') return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    };
    this.onMouseDown = (e) => {
      if (document.pointerLockElement !== this.renderer.domElement) return;
      if (!this.match || this.phase !== 'live' || !this.player.alive) return;
      if (e.button === 0) {
        this.mouseDown = true;
        const w = this.currentWeapon();
        if (!w.auto) this.tryShoot();
      }
      if (e.button === 2 && this.currentWeapon().scope) this.setScoped(true);
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.setScoped(false);
    };
    this.onWheel = () => {
      if (!this.match) return;
      this.switchWeapon(this.slot === 0 ? 1 : 0);
    };
    this.onContextMenu = (e) => e.preventDefault();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('wheel', this.onWheel);
    document.addEventListener('contextmenu', this.onContextMenu);
    this.resize = () => {
      const w = this.container.clientWidth || 800;
      const h = this.container.clientHeight || 600;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
  }

  lock() {
    try {
      const p = this.renderer.domElement.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => { /* pointer lock unavailable */ });
    } catch { /* pointer lock unavailable */ }
  }

  // ---------------------------------------------------------- match setup
  startMatch(cfg) {
    this.cfg = cfg; // { mode, agent, weaponId, skinId, items }
    this.mode = cfg.mode;
    this.agent = getAgent(cfg.agent);
    const primary = getWeapon(cfg.weaponId);
    const magMult = cfg.items.includes('extmag') ? 1.5 : 1;
    const fireMult = cfg.items.includes('grip') ? 1.15 : 1;
    const hpBonus = cfg.items.includes('vest') ? 25 : 0;
    this.slots = [
      { ...primary, mag: Math.round(primary.mag * magMult), fireInterval: primary.fireInterval / fireMult, ammo: Math.round(primary.mag * magMult) },
      { ...getWeapon('classic'), ammo: getWeapon('classic').mag },
    ];
    if (this.slots[0].id === 'classic') this.slots = [this.slots[0]];
    this.slot = 0;
    this.maxHp = this.agent.hp + hpBonus;
    this.player = {
      pos: new THREE.Vector3(-26, 0, 0),
      vel: new THREE.Vector3(),
      vy: 0,
      grounded: true,
      hp: this.maxHp,
      alive: true,
      kills: 0,
      deaths: 0,
    };
    this.yaw = -Math.PI / 2; // face +x (toward mid)
    this.pitch = 0;
    this.skillReadyAt = 0;
    this.healUntil = 0;
    this.reconUntil = 0;
    this.scoped = false;
    this.creditsEarned = 0;
    this.rounds = { us: 0, them: 0 };
    this.round = 1;
    this.roundsToWin = cfg.mode.roundsToWin || 5;
    this.kills = {}; // deathmatch scoreboard
    this.botNames = [...BOT_NAMES].sort(() => Math.random() - 0.5); // fixed names for the whole match
    this.matchStats = { You: { name: 'You', kills: 0, deaths: 0, team: 'ally' } };
    this.bots = [];
    this.buildViewmodel(getSkin(cfg.skinId));
    this.spawnBots();
    this.phase = 'countdown';
    this.phaseUntil = performance.now() + 3000;
    this.roundEndsAt = 0;
    this.matchEndsAt = 0;
    if (this.mode.id === 'deathmatch') {
      this.matchEndsAt = performance.now() + this.mode.timeLimit * 1000;
    }
    this.match = true;
    this.running = true;
    this.clock.start();
    this.loop();
    this.cb.hud(this.snapshot());
  }

  spawnBots() {
    for (const b of this.bots) b.dispose(this.scene);
    this.bots = [];
    const names = this.botNames;
    const allySpawns = [{ x: -26, z: -5 }, { x: -26, z: 5 }];
    const enemySpawns = [{ x: 26, z: -5 }, { x: 26, z: 0 }, { x: 26, z: 5 }];
    const mk = (name, team, spawn, color, gapIndex) => {
      const bot = new Bot(this.scene, { name, team, spawn, hp: 100, color });
      bot.gapIndex = gapIndex;
      if (!this.matchStats[name]) this.matchStats[name] = { name, kills: 0, deaths: 0, team };
      this.bots.push(bot);
    };
    if (this.mode.id === 'deathmatch') {
      const dmSpawns = [{ x: 26, z: -5 }, { x: 26, z: 5 }, { x: 0, z: -15 }, { x: 0, z: 15 }];
      dmSpawns.forEach((s, i) => mk(names[i], 'enemy', s, 0xff4655, i % 3));
    } else {
      allySpawns.forEach((s, i) => mk(names[i], 'ally', s, 0x35a7ff, i % 3));
      enemySpawns.forEach((s, i) => mk(names[i + 2], 'enemy', s, 0xff4655, (i + 1) % 3));
    }
  }

  buildViewmodel(skin) {
    if (this.viewmodel) {
      this.camera.remove(this.viewmodel);
    }
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: skin.body });
    const accentMat = new THREE.MeshLambertMaterial({ color: skin.accent, emissive: skin.glow });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161c });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(0.09, 0.13, 0.5), bodyMat, 0, 0, 0);
    add(new THREE.BoxGeometry(0.05, 0.05, 0.32), darkMat, 0, 0.03, -0.38);
    add(new THREE.BoxGeometry(0.07, 0.16, 0.1), accentMat, 0, -0.13, 0.05);
    add(new THREE.BoxGeometry(0.03, 0.07, 0.12), accentMat, 0, 0.09, -0.05);
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    this.flash.position.set(0, 0.03, -0.58);
    g.add(this.flash);
    g.position.set(0.28, -0.25, -0.5);
    this.camera.add(g);
    this.scene.add(this.camera);
    this.viewmodel = g;
    this.recoil = 0;
  }

  // ---------------------------------------------------------- weapons
  currentWeapon() { return this.slots[this.slot]; }

  switchWeapon(i) {
    if (i === this.slot || i >= this.slots.length || !this.match) return;
    this.slot = i;
    this.setScoped(false);
    this.reloading = false;
    this.cb.hud(this.snapshot());
  }

  startReload() {
    const w = this.currentWeapon();
    if (!this.match || this.reloading || w.ammo >= w.mag) return;
    this.reloading = true;
    this.reloadEndsAt = performance.now() + w.reloadMs;
  }

  setScoped(on) {
    if (this.scoped === on) return;
    this.scoped = on;
    this.camera.fov = on ? 28 : 75;
    this.camera.updateProjectionMatrix();
    this.cb.hud(this.snapshot());
  }

  tryShoot() {
    if (!this.match || this.phase !== 'live' || !this.player.alive) return;
    const w = this.currentWeapon();
    const now = performance.now();
    if (this.reloading || now < (this.nextShotAt || 0)) return;
    if (w.ammo <= 0) { this.startReload(); return; }
    w.ammo -= 1;
    this.nextShotAt = now + w.fireInterval;
    this.recoil = Math.min(this.recoil + 0.03, 0.09);
    this.audio.shoot();
    this.flash.material.opacity = 0.95;
    this.muzzleLight.position.copy(this.camera.position);
    this.muzzleLight.intensity = 2.2;
    const pellets = w.pellets || 1;
    let anyHit = false;
    let killed = null;
    for (let p = 0; p < pellets; p++) {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      dir.x += (Math.random() - 0.5) * w.spread * 2;
      dir.y += (Math.random() - 0.5) * w.spread * 2;
      dir.normalize();
      const origin = this.camera.position.clone();
      this.raycaster.set(origin, dir);
      this.raycaster.far = w.range;
      const botMeshes = [];
      for (const b of this.bots) {
        if (b.alive && b.team === 'enemy') b.group.traverse((m) => { if (m.isMesh) botMeshes.push(m); });
      }
      const botHits = this.raycaster.intersectObjects(botMeshes, false);
      const wallHits = this.raycaster.intersectObjects(this.wallMeshes, false);
      const wallDist = wallHits.length ? wallHits[0].distance : Infinity;
      const end = origin.clone().addScaledVector(dir, Math.min(wallDist, w.range));
      if (botHits.length && botHits[0].distance < wallDist) {
        const hit = botHits[0];
        const bot = this.bots.find((b) => b.id === hit.object.userData.botId);
        if (bot) {
          const dist = hit.distance;
          const falloff = Math.max(0.4, 1 - (dist / w.range) * 0.5);
          const head = hit.object.userData.part === 'head';
          const dmg = Math.round(w.damage * falloff * (head ? w.headshotMult : 1));
          const died = bot.takeDamage(dmg);
          anyHit = true;
          this.spawnBurst(hit.point, 0xff4655, 6);
          this.addTracer(origin.clone().addScaledVector(dir, 0.6), hit.point);
          if (died) {
            killed = { bot, head };
            this.onKill('You', bot, w.name, head);
          }
        }
      } else {
        this.addTracer(origin.clone().addScaledVector(dir, 0.6), end);
        if (wallHits.length) this.spawnBurst(wallHits[0].point, 0xffd27a, 3);
      }
    }
    if (anyHit) {
      this.audio.hit();
      this.cb.hud(this.snapshot({ hitmarker: true, headshot: killed?.head }));
    } else {
      this.cb.hud(this.snapshot());
    }
  }

  onKill(killerName, victim, weaponName, headshot) {
    this.cb.killfeed({ killer: killerName, victim: victim.name, weapon: weaponName, headshot });
    // persistent match stats (survive round respawns)
    if (!this.matchStats[killerName]) {
      this.matchStats[killerName] = { name: killerName, kills: 0, deaths: 0, team: killerName === 'You' ? 'ally' : 'enemy' };
    }
    this.matchStats[killerName].kills += 1;
    if (this.matchStats[victim.name]) this.matchStats[victim.name].deaths += 1;
    if (killerName === 'You') {
      this.player.kills += 1;
      this.audio.kill();
      const gain = this.mode.id === 'deathmatch' ? 50 : 100;
      this.creditsEarned += gain;
      this.cb.hud(this.snapshot({ creditGain: gain }));
    }
    victim.deaths += 1;
    if (this.mode.id === 'deathmatch') {
      this.kills[victim.name] = this.kills[victim.name] || 0;
      if (killerName === 'You') this.kills.You = (this.kills.You || 0) + 1;
      else this.kills[killerName] = (this.kills[killerName] || 0) + 1;
      if ((this.kills[killerName] || 0) >= this.mode.killTarget) {
        this.endMatch(killerName === 'You');
        return;
      }
      // respawn the bot after a delay
      setTimeout(() => {
        if (!this.match || this.phase === 'ended') return;
        victim.respawn(this.randomSpawn());
      }, 2000);
    } else {
      this.checkRoundEnd();
    }
  }

  randomSpawn() {
    const spots = [
      { x: 26, z: -5 }, { x: 26, z: 5 }, { x: 0, z: -15 }, { x: 0, z: 15 },
      { x: -20, z: -14 }, { x: 20, z: 14 },
    ];
    return spots[Math.floor(Math.random() * spots.length)];
  }

  // ---------------------------------------------------------- skills
  useSkill() {
    if (!this.match || this.phase !== 'live' || !this.player.alive) return;
    const now = performance.now();
    if (now < this.skillReadyAt) return;
    const skill = this.agent.skill;
    this.skillReadyAt = now + skill.cooldown * 1000;
    if (skill.id === 'dash') {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      dir.y = 0; dir.normalize();
      this.player.vel.addScaledVector(dir, 16);
      this.camera.fov = 82;
      this.camera.updateProjectionMatrix();
      setTimeout(() => { if (this.match) { this.camera.fov = this.scoped ? 28 : 75; this.camera.updateProjectionMatrix(); } }, 250);
    } else if (skill.id === 'heal') {
      this.healUntil = now + 3000;
    } else if (skill.id === 'smoke') {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.raycaster.set(this.camera.position, dir);
      this.raycaster.far = 30;
      const hits = this.raycaster.intersectObjects(this.wallMeshes, false);
      const point = hits.length ? hits[0].point : this.camera.position.clone().addScaledVector(dir, 25);
      point.y = 1.2;
      this.spawnSmoke(point);
    } else if (skill.id === 'recon') {
      this.reconUntil = now + 5000;
    }
    this.cb.hud(this.snapshot({ skillUsed: skill.name }));
  }

  spawnSmoke(point) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x9aa4b2, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), mat);
      s.position.set(point.x + (Math.random() - 0.5) * 2, point.y + (Math.random() - 0.5) * 1, point.z + (Math.random() - 0.5) * 2);
      group.add(s);
    }
    this.scene.add(group);
    this.smokes.push({ group, center: point.clone(), radius: 3.2, until: performance.now() + 6000 });
  }

  // ---------------------------------------------------------- damage / death
  damagePlayer(dmg, fromName) {
    if (!this.player.alive || this.phase !== 'live') return;
    this.player.hp -= dmg;
    this.audio.hurt();
    this.cb.hud(this.snapshot({ damaged: true }));
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.player.alive = false;
      this.player.deaths += 1;
      this.cb.killfeed({ killer: fromName, victim: 'You', weapon: 'Spectre', headshot: false });
      if (!this.matchStats[fromName]) {
        this.matchStats[fromName] = { name: fromName, kills: 0, deaths: 0, team: 'enemy' };
      }
      this.matchStats[fromName].kills += 1;
      this.matchStats.You.deaths += 1;
      document.exitPointerLock?.();
      this.cb.playerDied();
      if (this.mode.id === 'deathmatch') {
        this.kills[fromName] = (this.kills[fromName] || 0) + 1;
        if (this.kills[fromName] >= this.mode.killTarget) {
          this.endMatch(false);
          return;
        }
        setTimeout(() => {
          if (!this.match || this.phase === 'ended') return;
          this.player.hp = this.maxHp;
          this.player.alive = true;
          const s = this.randomSpawn();
          this.player.pos.set(s.x, 0, s.z);
          this.player.vel.set(0, 0, 0);
          this.cb.playerRespawned();
          this.cb.hud(this.snapshot());
        }, 2000);
      } else {
        this.checkRoundEnd();
      }
    }
  }

  checkRoundEnd() {
    if (this.mode.id === 'deathmatch' || this.phase !== 'live') return;
    const alliesAlive = (this.player.alive ? 1 : 0) + this.bots.filter((b) => b.team === 'ally' && b.alive).length;
    const enemiesAlive = this.bots.filter((b) => b.team === 'enemy' && b.alive).length;
    if (enemiesAlive === 0) this.endRound(true);
    else if (alliesAlive === 0) this.endRound(false);
  }

  endRound(won) {
    if (this.phase !== 'live') return;
    this.phase = 'roundEnd';
    if (won) {
      this.rounds.us += 1;
      this.creditsEarned += 300;
      this.audio.roundWin();
    } else {
      this.rounds.them += 1;
    }
    this.cb.roundEnd({ won, rounds: { ...this.rounds }, round: this.round, credits: this.creditsEarned });
    if (this.rounds.us >= this.roundsToWin || this.rounds.them >= this.roundsToWin) {
      setTimeout(() => this.endMatch(this.rounds.us >= this.roundsToWin), 2600);
    } else {
      setTimeout(() => this.nextRound(), 2600);
    }
  }

  nextRound() {
    if (!this.match || this.phase === 'ended') return;
    this.round += 1;
    this.player.hp = this.maxHp;
    this.player.alive = true;
    this.player.pos.set(-26, 0, 0);
    this.player.vel.set(0, 0, 0);
    this.yaw = -Math.PI / 2;
    this.pitch = 0;
    for (const s of this.slots) s.ammo = s.mag;
    this.spawnBots();
    this.smokes.forEach((s) => this.scene.remove(s.group));
    this.smokes = [];
    this.phase = 'countdown';
    this.phaseUntil = performance.now() + 3000;
    this.cb.playerRespawned();
    this.cb.hud(this.snapshot());
  }

  endMatch(won) {
    if (!this.match || this.phase === 'ended') return;
    this.phase = 'ended';
    document.exitPointerLock?.();
    const bonus = this.mode.id === 'ranked' ? (won ? 750 : 200)
      : this.mode.id === 'unranked' ? (won ? 500 : 150)
      : (won ? 300 : 100);
    this.creditsEarned += bonus;
    const rp = this.mode.id === 'ranked' ? (won ? 100 : 20) : 0;
    this.cb.matchEnd({
      won,
      mode: this.mode.id,
      kills: this.player.kills,
      deaths: this.player.deaths,
      rounds: { ...this.rounds },
      credits: this.creditsEarned,
      rp,
      scoreboard: this.buildScoreboard(),
    });
  }

  buildScoreboard() {
    const rows = Object.values(this.matchStats || {});
    rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return rows;
  }

  // ---------------------------------------------------------- bot AI
  botThink(bot, now) {
    if (!bot.alive) return;
    const enemies = bot.team === 'ally'
      ? this.bots.filter((b) => b.team === 'enemy' && b.alive)
      : [...this.bots.filter((b) => b.team === 'ally' && b.alive), ...(this.player.alive ? [{ isPlayer: true, pos: this.player.pos, hp: this.player.hp }] : [])];
    if (!enemies.length) return;
    let nearest = null;
    let nearestDist = Infinity;
    for (const e of enemies) {
      const d = bot.pos.distanceTo(e.pos);
      if (d < nearestDist) { nearestDist = d; nearest = e; }
    }
    bot.target = nearest;
    bot.targetDist = nearestDist;
    // line of sight
    const eye = bot.pos.clone(); eye.y = 1.6;
    const targetPos = nearest.pos.clone(); targetPos.y = 1.3;
    const dir = targetPos.clone().sub(eye);
    const dist = dir.length();
    dir.normalize();
    this.raycaster.set(eye, dir);
    this.raycaster.far = dist;
    const blocked = this.raycaster.intersectObjects(this.wallMeshes, false).length > 0;
    const smoked = this.smokes.some((s) => segmentHitsSphere(eye, targetPos, s.center, s.radius));
    bot.hasLOS = !blocked && !smoked && dist < 50;
    if (bot.hasLOS) {
      bot.navTarget = null;
      bot.lastSeen = targetPos.clone();
      if (now > bot.strafeUntil) {
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        bot.strafeUntil = now + 600 + Math.random() * 900;
      }
    } else if (!bot.navTarget || bot.pos.distanceTo(bot.navTarget) < 1.5) {
      // No sightline: route through a mid gap instead of ramming the wall.
      // Once across to the target's half, go direct again.
      const crossed = Math.sign(bot.pos.x) !== Math.sign(bot.spawnX);
      if (crossed) {
        bot.navTarget = null;
      } else {
        const g = GAPS[bot.gapIndex % GAPS.length];
        bot.navTarget = new THREE.Vector3(g.x, 0, g.z);
      }
    }
    // shooting
    if (bot.hasLOS && now >= bot.nextShot) {
      bot.nextShot = now + 380 + Math.random() * 420;
      const hitChance = Math.max(0.14, Math.min(0.6, 0.62 - dist * 0.009));
      const from = bot.pos.clone(); from.y = 1.4;
      const to = targetPos.clone();
      if (Math.random() < hitChance) {
        const dmg = 8 + Math.floor(Math.random() * 7);
        this.addTracer(from, to, bot.team === 'ally' ? 0x7ec8ff : 0xff8a94);
        if (nearest.isPlayer) {
          this.damagePlayer(dmg, bot.name);
        } else {
          const died = nearest.takeDamage(dmg);
          if (died) {
            bot.kills += 1;
            this.onKill(bot.name, nearest, 'Spectre', false);
          }
        }
      } else {
        to.x += (Math.random() - 0.5) * 2;
        to.y += (Math.random() - 0.5) * 1.5;
        this.addTracer(from, to, bot.team === 'ally' ? 0x7ec8ff : 0xff8a94);
      }
    }
  }

  botMove(bot, dt, now) {
    if (!bot.alive) return;
    let move = new THREE.Vector3();
    if (bot.hasLOS && bot.target) {
      // strafe while fighting
      const toTarget = bot.target.pos.clone().sub(bot.pos);
      toTarget.y = 0;
      const perp = new THREE.Vector3(-toTarget.z, 0, toTarget.x).normalize();
      move.copy(perp).multiplyScalar(bot.strafeDir);
      if (bot.targetDist > 26) move.add(toTarget.clone().normalize().multiplyScalar(0.6));
      if (bot.targetDist < 7) move.add(toTarget.clone().normalize().multiplyScalar(-0.8));
    } else {
      const dest = bot.navTarget || (bot.target ? bot.target.pos : bot.wander);
      move.copy(dest).sub(bot.pos);
      move.y = 0;
      if (move.lengthSq() > 0.01) move.normalize();
      if (!bot.navTarget && !bot.target && move.lengthSq() < 4) {
        bot.wander.set((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 28);
      }
    }
    if (move.lengthSq() > 0.001) {
      bot.pos.addScaledVector(move, bot.speed * dt);
      collideCircle(bot.pos, 0.5, this.colliders);
      bot.pos.x = Math.max(-ARENA.x, Math.min(ARENA.x, bot.pos.x));
      bot.pos.z = Math.max(-ARENA.z, Math.min(ARENA.z, bot.pos.z));
      const targetYaw = Math.atan2(move.x, move.z);
      let dy = targetYaw - bot.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      bot.yaw += dy * Math.min(1, dt * 8);
    }
    // stuck detection: barely moved while trying to move without sightline —
    // reroute through the next mid gap.
    if (!bot.hasLOS && move.lengthSq() > 0.001) {
      if (now - bot.lastMoveCheck > 1200) {
        if (bot.pos.distanceTo(bot.lastPos) < 0.3) {
          bot.gapIndex = (bot.gapIndex + 1) % GAPS.length;
          const g = GAPS[bot.gapIndex];
          bot.navTarget = new THREE.Vector3(
            g.x + (Math.random() - 0.5) * 2, 0, g.z + (Math.random() - 0.5) * 2);
        }
        bot.lastPos.copy(bot.pos);
        bot.lastMoveCheck = now;
      }
    }
    if (bot.target && bot.hasLOS) {
      const toT = bot.target.pos.clone().sub(bot.pos);
      const faceYaw = Math.atan2(toT.x, toT.z);
      let dy = faceYaw - bot.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      bot.yaw += dy * Math.min(1, dt * 10);
    }
    bot.group.position.copy(bot.pos);
    bot.group.rotation.y = bot.yaw;
    bot.barGroup.lookAt(this.camera.position);
  }

  // ---------------------------------------------------------- fx
  addTracer(from, to, color = 0xffd27a) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, until: performance.now() + 70 });
  }

  spawnBurst(point, color, count) {
    const geo = new THREE.TetrahedronGeometry(0.06);
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(point);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
      this.scene.add(m);
      this.particles.push({ mesh: m, vel, until: performance.now() + 500 });
    }
  }

  // ---------------------------------------------------------- snapshot / loop
  snapshot(extra = {}) {
    const now = performance.now();
    const w = this.currentWeapon ? this.currentWeapon() : null;
    let timer = 0;
    if (this.mode?.id === 'deathmatch') timer = Math.max(0, (this.matchEndsAt - now) / 1000);
    else if (this.phase === 'live') timer = Math.max(0, (this.roundEndsAt - now) / 1000);
    const markers = [];
    if (now < this.reconUntil) {
      for (const b of this.bots) {
        if (!b.alive || b.team !== 'enemy') continue;
        const v = b.pos.clone(); v.y = 1.8;
        v.project(this.camera);
        if (v.z < 1) markers.push({ x: (v.x * 0.5 + 0.5), y: (-v.y * 0.5 + 0.5), name: b.name });
      }
    }
    return {
      hp: this.player?.hp ?? 0,
      maxHp: this.maxHp ?? 100,
      alive: this.player?.alive ?? false,
      ammo: w?.ammo ?? 0,
      mag: w?.mag ?? 0,
      weaponName: w?.name ?? '',
      reloading: !!this.reloading,
      skillName: this.agent?.skill.name ?? '',
      skillCooldown: Math.max(0, (this.skillReadyAt - now) / 1000),
      skillTotal: this.agent?.skill.cooldown ?? 1,
      credits: this.creditsEarned,
      rounds: { ...(this.rounds || { us: 0, them: 0 }) },
      round: this.round || 1,
      roundsToWin: this.roundsToWin || 5,
      timer,
      phase: this.phase,
      countdown: this.phase === 'countdown' ? Math.max(0, (this.phaseUntil - now) / 1000) : 0,
      kills: this.player?.kills ?? 0,
      deaths: this.player?.deaths ?? 0,
      killTarget: this.mode?.killTarget || 0,
      scoped: !!this.scoped,
      markers,
      mode: this.mode?.id,
      alliesAlive: (this.player?.alive ? 1 : 0) + (this.bots || []).filter((b) => b.team === 'ally' && b.alive).length,
      enemiesAlive: (this.bots || []).filter((b) => b.team === 'enemy' && b.alive).length,
      scoreboard: this.mode?.id === 'deathmatch' ? this.buildScoreboard() : null,
      ...extra,
    };
  }

  loop = () => {
    if (!this.running || this.disposed) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();
    if (!this.match) { this.renderer.render(this.scene, this.camera); return; }

    // phase transitions
    if (this.phase === 'countdown' && now >= this.phaseUntil) {
      this.phase = 'live';
      if (this.mode.id !== 'deathmatch') this.roundEndsAt = now + 100000;
    }
    if (this.phase === 'live' && this.mode.id !== 'deathmatch' && now >= this.roundEndsAt) {
      const alliesAlive = (this.player.alive ? 1 : 0) + this.bots.filter((b) => b.team === 'ally' && b.alive).length;
      const enemiesAlive = this.bots.filter((b) => b.team === 'enemy' && b.alive).length;
      this.endRound(alliesAlive >= enemiesAlive);
    }
    if (this.phase === 'live' && this.mode.id === 'deathmatch' && now >= this.matchEndsAt) {
      const myKills = this.kills.You || 0;
      const bestBot = Math.max(0, ...Object.entries(this.kills).filter(([n]) => n !== 'You').map(([, k]) => k));
      this.endMatch(myKills >= bestBot && myKills > 0);
    }

    // healing
    if (now < this.healUntil && this.player.alive) {
      this.player.hp = Math.min(this.maxHp, this.player.hp + (50 / 3) * dt);
    }

    // player movement
    if (this.phase === 'live' && this.player.alive) {
      const speed = this.agent.speed * (this.scoped ? 0.5 : 1);
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const wish = new THREE.Vector3();
      if (this.keys.KeyW) wish.add(fwd);
      if (this.keys.KeyS) wish.sub(fwd);
      if (this.keys.KeyD) wish.add(right);
      if (this.keys.KeyA) wish.sub(right);
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
      this.player.vel.x += (wish.x - this.player.vel.x) * Math.min(1, dt * 10);
      this.player.vel.z += (wish.z - this.player.vel.z) * Math.min(1, dt * 10);
      if (this.keys.Space && this.player.grounded) {
        this.player.vy = 7;
        this.player.grounded = false;
      }
    } else {
      this.player.vel.x *= Math.max(0, 1 - dt * 6);
      this.player.vel.z *= Math.max(0, 1 - dt * 6);
    }
    this.player.vy -= 20 * dt;
    this.player.pos.x += this.player.vel.x * dt;
    this.player.pos.z += this.player.vel.z * dt;
    this.player.pos.y += this.player.vy * dt;
    if (this.player.pos.y <= 0) { this.player.pos.y = 0; this.player.vy = 0; this.player.grounded = true; }
    collideCircle(this.player.pos, 0.5, this.colliders);
    this.player.pos.x = Math.max(-ARENA.x, Math.min(ARENA.x, this.player.pos.x));
    this.player.pos.z = Math.max(-ARENA.z, Math.min(ARENA.z, this.player.pos.z));
    this.camera.position.set(this.player.pos.x, this.player.pos.y + 1.6, this.player.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // auto fire
    if (this.mouseDown && this.phase === 'live' && this.player.alive && this.currentWeapon().auto) {
      this.tryShoot();
    }
    // reload finish
    if (this.reloading && now >= this.reloadEndsAt) {
      this.reloading = false;
      const w = this.currentWeapon();
      w.ammo = w.mag;
      this.cb.hud(this.snapshot());
    }
    // recoil + flash decay
    this.recoil = Math.max(0, this.recoil - dt * 0.25);
    if (this.viewmodel) {
      this.viewmodel.position.z = -0.5 + this.recoil;
      this.viewmodel.rotation.x = this.recoil * 1.5;
    }
    if (this.flash) this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 14);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 40);

    // bots
    if (this.phase === 'live') {
      for (const b of this.bots) {
        if (!b.alive) continue;
        if (now >= b.nextThink) {
          b.nextThink = now + 120 + Math.random() * 80;
          this.botThink(b, now);
        }
        this.botMove(b, dt, now);
      }
    } else {
      for (const b of this.bots) if (b.alive) b.barGroup.lookAt(this.camera.position);
    }

    // recon glow
    const reconActive = now < this.reconUntil;
    for (const b of this.bots) {
      if (b.team !== 'enemy') continue;
      const m = b.torso.material;
      m.emissive.setHex(reconActive && b.alive ? 0x881111 : 0x000000);
    }

    // smoke expiry
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      if (now >= this.smokes[i].until) {
        this.scene.remove(this.smokes[i].group);
        this.smokes.splice(i, 1);
      }
    }
    // tracer expiry
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      if (now >= this.tracers[i].until) {
        this.scene.remove(this.tracers[i].line);
        this.tracers.splice(i, 1);
      }
    }
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 9 * dt;
      if (now >= p.until) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }

    // throttled HUD refresh (10 Hz) + countdown
    if (now - (this.lastHud || 0) > 100) {
      this.lastHud = now;
      this.cb.hud(this.snapshot());
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    this.running = false;
    this.match = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('resize', this.resize);
    document.exitPointerLock?.();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
