// AGENTSTRIKE — three.js FPS engine: Valorant-style map, spike plant/defuse,
// sides with halftime swap, realistic viewmodels, bots that play the objective.
import * as THREE from 'three';
import { getAgent, getWeapon, getSkin, BOT_NAMES, ULT } from './data.js';

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
  beep() { this.tone(1320, 0.09, 'square', 0.06); }
  plant() { this.tone(440, 0.1, 'sine', 0.09); this.tone(660, 0.14, 'sine', 0.09, 0.1); }
  defuse() { this.tone(660, 0.1, 'sine', 0.09); this.tone(880, 0.16, 'sine', 0.09, 0.1); }
  explosion() { this.tone(55, 0.7, 'sawtooth', 0.16); this.tone(38, 0.9, 'sine', 0.16, 0.05); }
  pickup() { this.tone(990, 0.07, 'sine', 0.07); }
}

// ---------------------------------------------------------------- map
const ARENA = { x: 30, z: 20 };
const ROUND_TIME = 100;      // seconds per round before the spike is planted
const SPIKE_TIME = 45;       // seconds from plant to detonation
const PLANT_TIME = 4;        // seconds to plant (hold E in a site)
const DEFUSE_TIME = 7;       // seconds to defuse (hold E near the spike)
const DEFUSE_HALF = 3.5;     // defuse checkpoint kept if interrupted
const ULT_KILLS = ULT.chargeNeeded;
const ULT_DURATION = ULT.duration;

// Bomb sites on the defenders' (east) half: A north, B south.
export const SITES = [
  { id: 'A', x: 20, z: -14, w: 11, d: 9, css: '#7ec8ff' },
  { id: 'B', x: 20, z: 14, w: 11, d: 9, css: '#ff8a94' },
];

const WALL_DEFS = [
  // perimeter
  { x: 0, z: -21, w: 64, d: 2, h: 5 }, { x: 0, z: 21, w: 64, d: 2, h: 5 },
  { x: -31, z: 0, w: 2, d: 44, h: 5 }, { x: 31, z: 0, w: 2, d: 44, h: 5 },
  // mid divider: two segments, three gaps (center, north edge, south edge)
  { x: 0, z: -9, w: 2, d: 10, h: 3.4 }, { x: 0, z: 9, w: 2, d: 10, h: 3.4 },
  // attacker-side buildings (west half)
  { x: -12, z: -12, w: 4, d: 3, h: 3 }, { x: -12, z: 12, w: 4, d: 3, h: 3 },
  // A-link / B-link blocks on the east approaches
  { x: 10, z: -12, w: 4, d: 2, h: 3 }, { x: 10, z: 12, w: 4, d: 2, h: 3 },
  // mid crates
  { x: -8, z: -6, w: 2, d: 2, h: 1.2 }, { x: -8, z: 6, w: 2, d: 2, h: 1.2 },
  { x: 8, z: 0, w: 2, d: 2, h: 1.2 },
  // site A cover
  { x: 17, z: -17, w: 2, d: 2, h: 1.2 }, { x: 23, z: -11, w: 2, d: 2, h: 1.2 },
  { x: 22, z: -17, w: 3, d: 2, h: 2 },
  // site B cover
  { x: 17, z: 17, w: 2, d: 2, h: 1.2 }, { x: 23, z: 11, w: 2, d: 2, h: 1.2 },
  { x: 22, z: 17, w: 3, d: 2, h: 2 },
  // spawn cover
  { x: -22, z: -6, w: 2, d: 2, h: 1.2 }, { x: -22, z: 6, w: 2, d: 2, h: 1.2 },
  { x: 24, z: 0, w: 2, d: 2, h: 1.2 },
];

// Static map data for the minimap (imported by ui.js).
export const MAP_DATA = { bounds: ARENA, walls: WALL_DEFS, sites: SITES };

const ATTACK_SPAWNS = [{ x: -27, z: -5 }, { x: -27, z: 0 }, { x: -27, z: 5 }];
const DEFENSE_SPAWNS = [{ x: 27, z: -5 }, { x: 27, z: 0 }, { x: 27, z: 5 }];

// Mid gaps bots route through when the direct path crosses the mid wall.
const GAPS = [
  { x: 0, z: 0 },
  { x: 0, z: -17 },
  { x: 0, z: 17 },
];

function siteAt(x, z) {
  for (const s of SITES) {
    if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2) return s;
  }
  return null;
}

function siteById(id) {
  return SITES.find((s) => s.id === id) || SITES[0];
}

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
    this.lastShotAt = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeUntil = 0;
    this.wander = new THREE.Vector3((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 14);
    this.kills = 0;
    this.deaths = 0;
    this.gapIndex = 0;
    this.navTarget = null; // waypoint when the direct path is blocked
    this.objective = null; // objective destination (Vector3) or null
    this.site = null; // 'A' | 'B' | 'mid' — assigned hold/push site
    this.isCarrier = false;
    this.channel = null; // { type: 'plant'|'defuse', progress }
    this.defuseCheckpoint = 0;
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
    // spike marker above the carrier's head
    this.spikeMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22),
      new THREE.MeshBasicMaterial({ color: 0xffa726 })
    );
    this.spikeMarker.position.set(0, 2.35, 0);
    this.spikeMarker.visible = false;
    this.group.add(this.spikeMarker);
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
  setCarrier(v) {
    this.isCarrier = v;
    this.spikeMarker.visible = v;
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
      this.channel = null;
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
    const blockMat = new THREE.MeshLambertMaterial({ color: 0x5a4a52 });
    WALL_DEFS.forEach((w) => {
      const mat = w.h > 3 ? wallMat : w.h > 1.5 ? blockMat : crateMat;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), mat);
      mesh.position.set(w.x, w.h / 2, w.z);
      scene.add(mesh);
      this.wallMeshes.push(mesh);
      this.colliders.push({
        minX: w.x - w.w / 2, maxX: w.x + w.w / 2,
        minZ: w.z - w.d / 2, maxZ: w.z + w.d / 2,
      });
    });
    // site floor decals + floating letters
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
    for (const s of SITES) {
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(s.w, s.d),
        new THREE.MeshBasicMaterial({ color: s.id === 'A' ? 0x2e6db4 : 0xb42e3e, transparent: true, opacity: 0.22, depthWrite: false })
      );
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(s.x, 0.03, s.z);
      scene.add(decal);
      mkLabel(s.id, s.x, s.z, s.css);
    }
    // the spike (shared 3D object, repositioned per state)
    this.spikeGroup = new THREE.Group();
    const spikeBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.5, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x1a1d24 })
    );
    spikeBody.position.y = 0.25;
    const spikeTip = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22),
      new THREE.MeshBasicMaterial({ color: 0xffa726 })
    );
    spikeTip.position.y = 0.68;
    this.spikeBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 9, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    this.spikeBeam.position.y = 4.5;
    this.spikeBeam.visible = false;
    this.spikeLight = new THREE.PointLight(0xffa726, 0, 12);
    this.spikeLight.position.y = 1;
    this.spikeGroup.add(spikeBody, spikeTip, this.spikeBeam, this.spikeLight);
    this.spikeGroup.visible = false;
    scene.add(this.spikeGroup);
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
    this.recoilPitch = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (!this.match) return;
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'KeyQ') this.useSkill();
      if (e.code === 'KeyX') this.useUlt();
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
      // viewmodel sway lags behind the look direction
      this.swayX = Math.max(-0.03, Math.min(0.03, this.swayX - e.movementX * 0.00035));
      this.swayY = Math.max(-0.02, Math.min(0.02, this.swayY + e.movementY * 0.0003));
    };
    this.onMouseDown = (e) => {
      if (document.pointerLockElement !== this.renderer.domElement) return;
      if (!this.match || this.phase !== 'live' || !this.player.alive) return;
      if (e.button === 0) {
        this.mouseDown = true;
        const w = this.currentWeapon();
        if (!w.auto) this.tryShoot();
      }
      if (e.button === 2) this.setAds(true);
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.setAds(false);
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
    this.skinId = cfg.skinId;
    const primary = getWeapon(cfg.weaponId);
    const magMult = cfg.items.includes('extmag') ? 1.5 : 1;
    const fireMult = cfg.items.includes('grip') ? 1.15 : 1;
    this.maxArmor = cfg.items.includes('vest') ? 25 : 0;
    this.slots = [
      { ...primary, mag: Math.round(primary.mag * magMult), fireInterval: primary.fireInterval / fireMult, ammo: Math.round(primary.mag * magMult), reserve: Math.round(primary.mag * magMult) * 4 },
      { ...getWeapon('classic'), ammo: getWeapon('classic').mag, reserve: 48 },
    ];
    if (this.slots[0].id === 'classic') this.slots = [this.slots[0]];
    this.slot = 0;
    this.maxHp = this.agent.hp;
    this.player = {
      pos: new THREE.Vector3(-27, 0, 0),
      vel: new THREE.Vector3(),
      vy: 0,
      grounded: true,
      hp: this.maxHp,
      alive: true,
      kills: 0,
      deaths: 0,
    };
    this.armor = this.maxArmor;
    this.yaw = -Math.PI / 2;
    this.pitch = 0;
    this.skillReadyAt = 0;
    this.healUntil = 0;
    this.reconUntil = 0;
    this.ultCharge = 0;
    this.ultActiveUntil = 0;
    this.ads = false;
    this.dashFovUntil = 0;
    this.creditsEarned = 0;
    this.rounds = { us: 0, them: 0 };
    this.round = 1;
    this.roundsToWin = cfg.mode.roundsToWin || 5;
    this.kills = {}; // deathmatch scoreboard
    this.botNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    this.matchStats = { You: { name: 'You', kills: 0, deaths: 0, team: 'ally' } };
    this.bots = [];
    // sides: the player's team attacks first; swap at halftime.
    this.playerAttacking = true;
    this.attackSite = Math.random() < 0.5 ? 'A' : 'B';
    this.spike = { state: 'carried', carrier: 'player', site: null, pos: null, detonateAt: 0 };
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.defuseCheckpoint = 0;
    this.lastBeep = 0;
    this.matchEndsAt = 0;
    if (this.mode.id === 'deathmatch') {
      this.matchEndsAt = performance.now() + this.mode.timeLimit * 1000;
    }
    this.buildViewmodel();
    this.startRound();
    this.match = true;
    this.running = true;
    this.clock.start();
    this.loop();
    this.cb.hud(this.snapshot());
  }

  startRound() {
    // spawn the player on their side's spawn, facing mid
    const spawn = this.playerAttacking ? ATTACK_SPAWNS[1] : DEFENSE_SPAWNS[1];
    this.player.pos.set(spawn.x, 0, spawn.z);
    this.player.vel.set(0, 0, 0);
    this.player.hp = this.maxHp;
    this.player.alive = true;
    this.armor = this.maxArmor;
    this.yaw = this.playerAttacking ? -Math.PI / 2 : Math.PI / 2;
    this.pitch = 0;
    for (const s of this.slots) { s.ammo = s.mag; s.reserve = s.id === 'classic' ? 48 : s.mag * 4; }
    this.reloading = false;
    this.setAds(false);
    // spike: fresh round, attackers carry it
    this.attackSite = Math.random() < 0.5 ? 'A' : 'B';
    this.spike = { state: 'carried', carrier: this.playerAttacking ? 'player' : null, site: null, pos: null, detonateAt: 0 };
    this.plantProgress = 0;
    this.plantStartedAt = 0;
    this.defuseProgress = 0;
    this.defuseCheckpoint = 0;
    this.defuseStartedAt = 0;
    this.lastBeep = 0;
    this.spawnBots();
    if (!this.playerAttacking) {
      // an enemy bot carries the spike
      const attackers = this.bots.filter((b) => b.team === 'enemy');
      const carrier = attackers[Math.floor(Math.random() * attackers.length)];
      if (carrier) {
        carrier.setCarrier(true);
        this.spike.carrier = carrier.id;
      }
    }
    this.smokes.forEach((s) => this.scene.remove(s.group));
    this.smokes = [];
    this.phase = 'countdown';
    this.phaseUntil = performance.now() + 3000;
    this.roundEndsAt = 0;
    this.cb.playerRespawned();
    this.cb.hud(this.snapshot());
  }

  spawnBots() {
    for (const b of this.bots) b.dispose(this.scene);
    this.bots = [];
    const names = this.botNames;
    const allySpawns = this.playerAttacking
      ? [ATTACK_SPAWNS[0], ATTACK_SPAWNS[2]]
      : [DEFENSE_SPAWNS[0], DEFENSE_SPAWNS[2]];
    const enemySpawns = this.playerAttacking
      ? DEFENSE_SPAWNS
      : ATTACK_SPAWNS;
    const mk = (name, team, spawn, color, gapIndex, site) => {
      const bot = new Bot(this.scene, { name, team, spawn, hp: 100, color });
      bot.gapIndex = gapIndex;
      bot.site = site;
      if (!this.matchStats[name]) this.matchStats[name] = { name, kills: 0, deaths: 0, team };
      this.bots.push(bot);
    };
    if (this.mode.id === 'deathmatch') {
      const dmSpawns = [{ x: 26, z: -5 }, { x: 26, z: 5 }, { x: 0, z: -15 }, { x: 0, z: 15 }];
      dmSpawns.forEach((s, i) => mk(names[i], 'enemy', s, 0xff4655, i % 3, null));
    } else {
      // attackers all push the attack site; defenders split A / B / mid
      const allySite = this.playerAttacking ? this.attackSite : null;
      const enemySite = this.playerAttacking ? null : this.attackSite;
      allySpawns.forEach((s, i) => mk(names[i], 'ally', s, 0x35a7ff, i % 3,
        this.playerAttacking ? allySite : (i === 0 ? 'A' : 'B')));
      enemySpawns.forEach((s, i) => mk(names[i + 2], 'enemy', s, 0xff4655, (i + 1) % 3,
        this.playerAttacking ? (i === 0 ? 'A' : i === 1 ? 'B' : 'mid') : enemySite));
    }
  }

  // ---------------------------------------------------------- spike
  getCarrier() {
    if (this.spike.state !== 'carried') return null;
    if (this.spike.carrier === 'player') return { isPlayer: true, pos: this.player.pos, alive: this.player.alive, name: 'You' };
    const bot = this.bots.find((b) => b.id === this.spike.carrier);
    return bot || null;
  }

  botIsAttacker(bot) {
    return (bot.team === 'ally') === this.playerAttacking;
  }

  dropSpike(pos) {
    if (this.spike.state !== 'carried') return;
    const carrier = this.getCarrier();
    if (carrier && !carrier.isPlayer) carrier.setCarrier(false);
    this.spike.state = 'dropped';
    this.spike.carrier = null;
    this.spike.pos = pos.clone();
    this.spike.pos.y = 0;
    this.cb.hud(this.snapshot({ notice: 'Spike dropped' }));
  }

  pickupSpike(picker) {
    if (this.spike.state !== 'dropped') return;
    this.spike.state = 'carried';
    this.spike.pos = null;
    if (picker.isPlayer) {
      this.spike.carrier = 'player';
      this.audio.pickup();
      this.cb.hud(this.snapshot({ notice: 'You picked up the spike' }));
    } else {
      picker.setCarrier(true);
      this.spike.carrier = picker.id;
    }
  }

  plantSpike(by, siteId) {
    if (this.spike.state !== 'carried' || this.phase !== 'live') return;
    const site = siteById(siteId);
    const pos = by.isPlayer ? this.player.pos : by.pos;
    this.spike.state = 'planted';
    this.spike.carrier = null;
    this.spike.site = site.id;
    this.spike.pos = pos.clone();
    this.spike.pos.y = 0;
    this.spike.detonateAt = performance.now() + SPIKE_TIME * 1000;
    this.plantProgress = 0;
    if (by.isPlayer) {
      this.creditsEarned += 150;
      this.cb.hud(this.snapshot({ notice: `Spike planted — Site ${site.id}`, creditGain: 150 }));
    } else {
      by.setCarrier(false);
      this.cb.hud(this.snapshot({ notice: `Spike planted — Site ${site.id} by ${by.name}` }));
    }
    this.audio.plant();
  }

  defuseSpike(by) {
    if (this.spike.state !== 'planted' || this.phase !== 'live') return;
    this.audio.defuse();
    // defenders win the round
    this.endRound(!this.playerAttacking, 'defuse');
  }

  // ---------------------------------------------------------- viewmodel
  buildViewmodel() {
    if (this.viewmodel) this.camera.remove(this.viewmodel);
    const weapon = this.currentWeapon();
    const skin = getSkin(this.skinId);
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: skin.body });
    const accentMat = new THREE.MeshLambertMaterial({ color: skin.accent, emissive: skin.glow });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161c });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
    const box = (w, h, d, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      g.add(m);
      return m;
    };
    const cyl = (r, len, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    let muzzleZ = 0.4;
    if (weapon.id === 'classic') {
      // pistol: slide, short barrel, grip, front sight
      box(0.07, 0.07, 0.28, bodyMat, 0, 0.02, -0.1);
      box(0.04, 0.04, 0.08, darkMat, 0, 0.02, -0.28);
      box(0.06, 0.15, 0.09, darkMat, 0, -0.08, 0.04, 0.25);
      box(0.02, 0.05, 0.06, metalMat, 0, -0.04, -0.03);
      box(0.015, 0.04, 0.015, accentMat, 0, 0.075, -0.24);
      box(0.05, 0.02, 0.1, accentMat, 0, -0.02, -0.1);
      muzzleZ = 0.34;
    } else if (weapon.id === 'spectre') {
      // SMG: receiver, suppressor, long mag, foregrip, stock
      box(0.08, 0.1, 0.42, bodyMat, 0, 0, -0.08);
      cyl(0.026, 0.22, darkMat, 0, 0.01, -0.4);
      box(0.06, 0.19, 0.09, darkMat, 0, -0.13, -0.08);
      box(0.06, 0.08, 0.16, darkMat, 0, -0.01, 0.2);
      box(0.05, 0.09, 0.06, accentMat, 0, -0.09, -0.26);
      box(0.03, 0.05, 0.06, accentMat, 0, 0.075, -0.05);
      box(0.05, 0.03, 0.2, metalMat, 0, 0.05, -0.2);
      muzzleZ = 0.52;
    } else if (weapon.id === 'phantom') {
      // rifle: long receiver, barrel, curved mag, stock, scope, handguard
      box(0.08, 0.11, 0.55, bodyMat, 0, 0, -0.1);
      cyl(0.02, 0.25, darkMat, 0, 0.02, -0.5);
      box(0.06, 0.17, 0.1, darkMat, 0, -0.13, -0.08, 0.15);
      box(0.07, 0.1, 0.2, darkMat, 0, -0.01, 0.26);
      box(0.07, 0.07, 0.25, accentMat, 0, -0.01, -0.35);
      cyl(0.032, 0.16, darkMat, 0, 0.1, -0.12);
      cyl(0.028, 0.02, accentMat, 0, 0.1, -0.2);
      box(0.05, 0.1, 0.07, darkMat, 0, -0.1, 0.1, 0.3);
      muzzleZ = 0.64;
    } else if (weapon.id === 'judge') {
      // shotgun: wide receiver, twin barrels, pump, stock, shell holder
      box(0.1, 0.12, 0.5, bodyMat, 0, 0, -0.08);
      cyl(0.03, 0.3, darkMat, -0.035, 0.03, -0.45);
      cyl(0.03, 0.3, darkMat, 0.035, 0.03, -0.45);
      box(0.09, 0.08, 0.18, accentMat, 0, -0.03, -0.32);
      box(0.08, 0.12, 0.22, darkMat, 0, -0.02, 0.26);
      box(0.11, 0.03, 0.12, accentMat, 0, 0.075, 0.05);
      box(0.06, 0.1, 0.08, darkMat, 0, -0.1, 0.08, 0.3);
      muzzleZ = 0.62;
    } else if (weapon.id === 'operator') {
      // sniper: long receiver, very long barrel, big scope, stock, bipod
      box(0.08, 0.1, 0.6, bodyMat, 0, 0, -0.12);
      cyl(0.018, 0.5, darkMat, 0, 0.02, -0.65);
      box(0.05, 0.05, 0.08, metalMat, 0, 0.02, -0.9);
      cyl(0.036, 0.2, darkMat, 0, 0.1, -0.15);
      cyl(0.03, 0.02, accentMat, 0, 0.1, -0.25);
      box(0.07, 0.11, 0.24, darkMat, 0, -0.01, 0.3);
      box(0.05, 0.12, 0.08, accentMat, 0, -0.11, -0.1);
      box(0.02, 0.12, 0.02, darkMat, -0.05, -0.1, -0.5, 0.4);
      box(0.02, 0.12, 0.02, darkMat, 0.05, -0.1, -0.5, -0.4);
      muzzleZ = 0.95;
    }
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    this.flash.position.set(0, 0.03, -muzzleZ - 0.06);
    g.add(this.flash);
    // scaled down and pushed forward so the stock never crowds the camera
    g.scale.setScalar(0.85);
    g.position.set(0.3, -0.27, -0.62);
    this.camera.add(g);
    this.scene.add(this.camera);
    this.viewmodel = g;
    this.viewmodelBase = new THREE.Vector3(0.3, -0.27, -0.62);
    this.viewmodelAds = new THREE.Vector3(0, -0.09, -0.5);
    this.muzzleZ = muzzleZ;
    this.recoil = 0;
    this.bobPhase = 0;
  }


  // ---------------------------------------------------------- weapons
  currentWeapon() { return this.slots[this.slot]; }

  switchWeapon(i) {
    if (i === this.slot || i >= this.slots.length || !this.match) return;
    this.slot = i;
    this.setAds(false);
    this.reloading = false;
    this.buildViewmodel();
    this.cb.hud(this.snapshot());
  }

  startReload() {
    const w = this.currentWeapon();
    if (!this.match || this.reloading || w.ammo >= w.mag) return;
    if (w.reserve <= 0) {
      this.cb.hud(this.snapshot({ notice: 'No reserve ammo' }));
      return;
    }
    this.reloading = true;
    this.reloadEndsAt = performance.now() + w.reloadMs;
    this.reloadTotal = w.reloadMs;
  }

  setAds(on) {
    if (this.ads === on) return;
    this.ads = on;
    this.cb.hud(this.snapshot());
  }

  tryShoot() {
    if (!this.match || this.phase !== 'live' || !this.player.alive) return;
    const w = this.currentWeapon();
    const now = performance.now();
    if (this.reloading || now < (this.nextShotAt || 0)) return;
    if (w.ammo <= 0) { this.startReload(); return; }
    w.ammo -= 1;
    const ultActive = now < this.ultActiveUntil;
    this.nextShotAt = now + w.fireInterval * (ultActive ? 0.6 : 1);
    this.recoil = Math.min(this.recoil + 0.03, 0.09);
    this.recoilPitch = Math.min(this.recoilPitch + (w.id === 'operator' ? 0.035 : w.id === 'judge' ? 0.022 : 0.011), 0.09);
    this.lastShotAt = now;
    this.audio.shoot();
    this.flash.material.opacity = 0.95;
    this.muzzleLight.position.copy(this.camera.position);
    this.muzzleLight.intensity = 2.2;
    const pellets = w.pellets || 1;
    let anyHit = false;
    let killed = null;
    for (let p = 0; p < pellets; p++) {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const spread = this.ads ? w.spread * 0.45 : w.spread;
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
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
      if (this.ultCharge < ULT_KILLS) this.ultCharge += 1;
      this.cb.hud(this.snapshot({ creditGain: gain }));
    }
    victim.deaths += 1;
    // the spike drops where its carrier falls
    if (victim.isCarrier) this.dropSpike(victim.pos);
    if (this.mode.id === 'deathmatch') {
      this.kills[victim.name] = this.kills[victim.name] || 0;
      if (killerName === 'You') this.kills.You = (this.kills.You || 0) + 1;
      else this.kills[killerName] = (this.kills[killerName] || 0) + 1;
      if ((this.kills[killerName] || 0) >= this.mode.killTarget) {
        this.endMatch(killerName === 'You');
        return;
      }
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

  // ---------------------------------------------------------- skills + ult
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
      this.dashFovUntil = now + 250;
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

  useUlt() {
    if (!this.match || this.phase !== 'live' || !this.player.alive) return;
    const now = performance.now();
    if (this.ultCharge < ULT_KILLS || now < this.ultActiveUntil) return;
    this.ultCharge = 0;
    this.ultActiveUntil = now + ULT_DURATION * 1000;
    this.player.hp = Math.min(this.maxHp, this.player.hp + 50);
    this.cb.hud(this.snapshot({ skillUsed: `${ULT.name} activated` }));
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
    // armor absorbs half the damage until it breaks
    let remaining = dmg;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, Math.round(dmg * 0.5));
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.player.hp -= remaining;
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
      if (this.spike.state === 'carried' && this.spike.carrier === 'player') {
        this.dropSpike(this.player.pos);
      }
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
    if (this.spike.state === 'planted') {
      // with the spike down, only a full defender wipe ends the round early —
      // a wiped attack still wins if the spike goes off
      const defAlive = this.playerAttacking ? enemiesAlive : alliesAlive;
      if (defAlive === 0) this.endRound(this.playerAttacking, 'elimination');
      return;
    }
    if (enemiesAlive === 0) this.endRound(true, 'elimination');
    else if (alliesAlive === 0) this.endRound(false, 'elimination');
  }

  endRound(won, reason = 'elimination') {
    if (this.phase !== 'live') return;
    this.phase = 'roundEnd';
    if (won) {
      this.rounds.us += 1;
      this.creditsEarned += 300;
      this.audio.roundWin();
    } else {
      this.rounds.them += 1;
    }
    this.cb.roundEnd({ won, rounds: { ...this.rounds }, round: this.round, credits: this.creditsEarned, reason });
    if (this.rounds.us >= this.roundsToWin || this.rounds.them >= this.roundsToWin) {
      setTimeout(() => this.endMatch(this.rounds.us >= this.roundsToWin), 2600);
    } else {
      setTimeout(() => this.nextRound(), 2600);
    }
  }

  nextRound() {
    if (!this.match || this.phase === 'ended') return;
    this.round += 1;
    // halftime: ranked swaps after round 4, unranked after round 2
    const swapAt = this.mode.id === 'ranked' ? 5 : 3;
    let swapped = false;
    if (this.mode.id !== 'deathmatch' && this.round === swapAt) {
      this.playerAttacking = !this.playerAttacking;
      swapped = true;
    }
    this.startRound();
    if (swapped) {
      this.cb.hud(this.snapshot({ notice: 'HALFTIME — sides swapped' }));
    }
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
  botObjective(bot) {
    if (this.mode.id === 'deathmatch') return null;
    const spike = this.spike;
    if (this.botIsAttacker(bot)) {
      if (spike.state === 'planted') {
        // defend the planted spike: hold near it
        return spike.pos.clone();
      }
      if (spike.state === 'dropped') return spike.pos.clone();
      // spike carried: push the attack site (escort the carrier if far behind)
      const site = siteById(this.attackSite);
      const dest = new THREE.Vector3(site.x + (Math.random() - 0.5) * 4, 0, site.z + (Math.random() - 0.5) * 3);
      if (!bot.isCarrier) {
        const carrier = this.getCarrier();
        if (carrier && !carrier.isPlayer && carrier.alive) {
          const carrierToSite = carrier.pos.distanceTo(dest);
          const meToCarrier = bot.pos.distanceTo(carrier.pos);
          if (carrierToSite > 12 && meToCarrier > 6) return carrier.pos.clone();
        }
      }
      return dest;
    }
    // defender
    if (spike.state === 'planted') return spike.pos.clone(); // retake + defuse
    if (bot.site === 'mid') return new THREE.Vector3(14, 0, (Math.random() - 0.5) * 10);
    const site = siteById(bot.site || 'A');
    return new THREE.Vector3(site.x + (Math.random() - 0.5) * 6, 0, site.z + (Math.random() - 0.5) * 4);
  }

  botThink(bot, now) {
    if (!bot.alive) return;
    bot.objective = this.botObjective(bot);
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
    } else {
      // No sightline: if the destination is across the mid wall, route via the
      // gap nearest the destination; otherwise go direct.
      const dest = bot.objective || (bot.target ? bot.target.pos : null);
      const needCross = dest && Math.abs(dest.x) > 2 && Math.abs(bot.pos.x) > 2
        && Math.sign(dest.x) !== Math.sign(bot.pos.x);
      if (needCross) {
        if (!bot.navTarget || bot.pos.distanceTo(bot.navTarget) < 1.5) {
          let best = GAPS[0];
          let bestD = Infinity;
          for (const g of GAPS) {
            const d = Math.abs(g.z - dest.z);
            if (d < bestD) { bestD = d; best = g; }
          }
          bot.navTarget = new THREE.Vector3(best.x, 0, best.z);
        }
      } else {
        bot.navTarget = null;
      }
    }
    // shooting (never while planting/defusing)
    if (bot.hasLOS && !bot.channel && now >= bot.nextShot) {
      bot.nextShot = now + 380 + Math.random() * 420;
      bot.lastShotAt = now;
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

  // Plant/defuse channels run on the wall clock, not the frame clock, so a
  // slow frame rate never stretches a 4s plant into 16s of real time.
  updateBotChannels(now) {
    if (this.mode.id === 'deathmatch' || this.phase !== 'live') return;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      if (this.botIsAttacker(bot) && bot.isCarrier && this.spike.state === 'carried') {
        const site = siteAt(bot.pos.x, bot.pos.z);
        if (site) {
          if (!bot.channel || bot.channel.type !== 'plant') bot.channel = { type: 'plant', startedAt: now, base: 0 };
          const p = bot.channel.base + (now - bot.channel.startedAt) / 1000;
          if (p >= PLANT_TIME) {
            bot.channel = null;
            this.plantSpike(bot, site.id);
          }
          continue;
        }
      }
      if (!this.botIsAttacker(bot) && this.spike.state === 'planted' && this.spike.pos) {
        const d = bot.pos.distanceTo(this.spike.pos);
        if (d <= 2.5) {
          if (!bot.channel || bot.channel.type !== 'defuse') {
            bot.channel = { type: 'defuse', startedAt: now, base: bot.defuseCheckpoint };
          }
          const p = bot.channel.base + (now - bot.channel.startedAt) / 1000;
          if (p >= DEFUSE_HALF) bot.defuseCheckpoint = DEFUSE_HALF;
          if (p >= DEFUSE_TIME) {
            bot.channel = null;
            bot.defuseCheckpoint = 0;
            this.defuseSpike(bot);
          }
          continue;
        }
      }
      // channel broken: plant resets, defuse keeps its half checkpoint
      bot.channel = null;
    }
  }

  updatePlayerChannel(now) {
    if (this.mode.id === 'deathmatch' || this.phase !== 'live' || !this.player.alive) {
      this.plantProgress = 0;
      this.plantStartedAt = 0;
      this.defuseStartedAt = 0;
      return;
    }
    const holding = !!this.keys.KeyE;
    if (holding && this.playerAttacking && this.spike.state === 'carried' && this.spike.carrier === 'player') {
      const site = siteAt(this.player.pos.x, this.player.pos.z);
      if (site) {
        if (!this.plantStartedAt) this.plantStartedAt = now;
        this.plantProgress = (now - this.plantStartedAt) / 1000;
        if (this.plantProgress >= PLANT_TIME) {
          this.plantProgress = 0;
          this.plantStartedAt = 0;
          this.plantSpike({ isPlayer: true }, site.id);
        }
        return;
      }
    }
    if (holding && !this.playerAttacking && this.spike.state === 'planted' && this.spike.pos) {
      const d = this.player.pos.distanceTo(this.spike.pos);
      if (d <= 2.5) {
        if (!this.defuseStartedAt) this.defuseStartedAt = now;
        this.defuseProgress = this.defuseCheckpoint + (now - this.defuseStartedAt) / 1000;
        if (this.defuseProgress >= DEFUSE_HALF) this.defuseCheckpoint = DEFUSE_HALF;
        if (this.defuseProgress >= DEFUSE_TIME) {
          this.defuseProgress = 0;
          this.defuseCheckpoint = 0;
          this.defuseStartedAt = 0;
          this.defuseSpike({ isPlayer: true });
        }
        return;
      }
    }
    // not channeling: plant resets, defuse falls back to its checkpoint
    this.plantProgress = 0;
    this.plantStartedAt = 0;
    this.defuseStartedAt = 0;
    if (this.defuseProgress > 0) this.defuseProgress = this.defuseCheckpoint;
  }

  botMove(bot, dt, now) {
    if (!bot.alive || bot.channel) return; // channeling bots stand still
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
      const dest = bot.navTarget || bot.objective || (bot.target ? bot.target.pos : bot.wander);
      move.copy(dest).sub(bot.pos);
      move.y = 0;
      if (move.lengthSq() > 0.01) move.normalize();
      if (!bot.navTarget && !bot.objective && !bot.target && move.lengthSq() < 4) {
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
    // sidestep around the obstacle, or reroute through the next mid gap.
    if (!bot.hasLOS && move.lengthSq() > 0.001) {
      if (now - bot.lastMoveCheck > 1200) {
        if (bot.pos.distanceTo(bot.lastPos) < 0.3) {
          const dest = bot.objective || (bot.target ? bot.target.pos : null);
          const needCross = dest && Math.abs(dest.x) > 2 && Math.abs(bot.pos.x) > 2
            && Math.sign(dest.x) !== Math.sign(bot.pos.x);
          if (needCross) {
            bot.gapIndex = (bot.gapIndex + 1) % GAPS.length;
            const g = GAPS[bot.gapIndex];
            bot.navTarget = new THREE.Vector3(g.x, 0, g.z);
          } else {
            const side = Math.random() < 0.5 ? -1 : 1;
            bot.navTarget = new THREE.Vector3(
              bot.pos.x + (-move.z) * side * 3.5, 0,
              bot.pos.z + move.x * side * 3.5);
          }
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

  updateSpikeVisual(now) {
    const g = this.spikeGroup;
    if (!this.match || this.mode.id === 'deathmatch') { g.visible = false; return; }
    const s = this.spike;
    if (s.state === 'carried') {
      const carrier = this.getCarrier();
      if (carrier && !carrier.isPlayer && carrier.alive) {
        g.visible = true;
        g.position.set(carrier.pos.x, 2.35, carrier.pos.z);
        this.spikeBeam.visible = false;
        this.spikeLight.intensity = 0;
      } else {
        g.visible = false; // the player carries it: shown in the HUD instead
      }
      return;
    }
    if (s.state === 'dropped' && s.pos) {
      g.visible = true;
      g.position.set(s.pos.x, 0, s.pos.z);
      this.spikeBeam.visible = false;
      this.spikeLight.intensity = 0.6;
      return;
    }
    if (s.state === 'planted' && s.pos) {
      g.visible = true;
      g.position.set(s.pos.x, 0, s.pos.z);
      this.spikeBeam.visible = true;
      // blink faster as detonation nears
      const left = Math.max(0, (s.detonateAt - now) / 1000);
      const blink = left > 10 ? (Math.sin(now / 240) > 0 ? 1.6 : 0.4) : (Math.sin(now / 110) > 0 ? 2.4 : 0.3);
      this.spikeLight.intensity = blink;
      return;
    }
    g.visible = false;
  }

  // ---------------------------------------------------------- snapshot / loop
  snapshot(extra = {}) {
    const now = performance.now();
    const w = this.currentWeapon ? this.currentWeapon() : null;
    let timer = 0;
    if (this.mode?.id === 'deathmatch') timer = Math.max(0, (this.matchEndsAt - now) / 1000);
    else if (this.phase === 'live' && this.spike?.state === 'planted') timer = Math.max(0, (this.spike.detonateAt - now) / 1000);
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
    // minimap entities
    const reconActive = now < this.reconUntil;
    const enemies = (this.bots || []).filter((b) => b.team === 'enemy').map((b) => {
      let visible = !b.alive ? false : reconActive || (now - (b.lastShotAt || 0) < 2000);
      if (b.alive && !visible && this.player?.alive) {
        // player line of sight
        const eye = this.camera.position.clone();
        const target = b.pos.clone(); target.y = 1.3;
        const dir = target.clone().sub(eye);
        const dist = dir.length();
        if (dist < 60) {
          dir.normalize();
          this.raycaster.set(eye, dir);
          this.raycaster.far = dist;
          visible = this.raycaster.intersectObjects(this.wallMeshes, false).length === 0;
        }
      }
      if (b.alive && !visible) {
        // seen by an ally bot
        visible = (this.bots || []).some((a) => a.team === 'ally' && a.alive && a.hasLOS && a.target === b);
      }
      return { x: b.pos.x, z: b.pos.z, alive: b.alive, visible, name: b.name, carrier: b.isCarrier };
    });
    const allies = (this.bots || []).filter((b) => b.team === 'ally').map((b) => (
      { x: b.pos.x, z: b.pos.z, alive: b.alive, name: b.name, carrier: b.isCarrier }
    ));
    const carrier = this.getCarrier ? this.getCarrier() : null;
    const inSite = this.player ? siteAt(this.player.pos.x, this.player.pos.z) : null;
    const canPlant = this.mode?.id !== 'deathmatch' && this.phase === 'live' && this.playerAttacking
      && this.spike?.state === 'carried' && this.spike?.carrier === 'player' && !!inSite && this.player?.alive;
    const canDefuse = this.mode?.id !== 'deathmatch' && this.phase === 'live' && !this.playerAttacking
      && this.spike?.state === 'planted' && this.spike?.pos && this.player?.alive
      && this.player.pos.distanceTo(this.spike.pos) <= 2.5;
    return {
      hp: this.player?.hp ?? 0,
      maxHp: this.maxHp ?? 100,
      armor: this.armor ?? 0,
      maxArmor: this.maxArmor ?? 0,
      alive: this.player?.alive ?? false,
      ammo: w?.ammo ?? 0,
      mag: w?.mag ?? 0,
      reserve: w?.reserve ?? 0,
      weaponName: w?.name ?? '',
      reloading: !!this.reloading,
      skillName: this.agent?.skill.name ?? '',
      skillCooldown: Math.max(0, (this.skillReadyAt - now) / 1000),
      skillTotal: this.agent?.skill.cooldown ?? 1,
      ultCharge: this.ultCharge ?? 0,
      ultNeeded: ULT_KILLS,
      ultReady: (this.ultCharge ?? 0) >= ULT_KILLS,
      ultActive: now < (this.ultActiveUntil || 0),
      ultLeft: Math.max(0, ((this.ultActiveUntil || 0) - now) / 1000),
      credits: this.creditsEarned,
      rounds: { ...(this.rounds || { us: 0, them: 0 }) },
      round: this.round || 1,
      roundsToWin: this.roundsToWin || 5,
      side: this.playerAttacking ? 'attack' : 'defense',
      timer,
      phase: this.phase,
      countdown: this.phase === 'countdown' ? Math.max(0, (this.phaseUntil - now) / 1000) : 0,
      kills: this.player?.kills ?? 0,
      deaths: this.player?.deaths ?? 0,
      killTarget: this.mode?.killTarget || 0,
      scoped: !!this.ads,
      adsScoped: !!this.ads && w?.scope,
      markers,
      mode: this.mode?.id,
      alliesAlive: (this.player?.alive ? 1 : 0) + (this.bots || []).filter((b) => b.team === 'ally' && b.alive).length,
      enemiesAlive: (this.bots || []).filter((b) => b.team === 'enemy' && b.alive).length,
      scoreboard: this.mode?.id === 'deathmatch' ? this.buildScoreboard() : null,
      spike: {
        state: this.spike?.state || 'carried',
        carrierName: carrier ? carrier.name : null,
        playerCarries: this.spike?.carrier === 'player',
        site: this.spike?.site || null,
        x: this.spike?.pos ? this.spike.pos.x : (carrier ? carrier.pos.x : null),
        z: this.spike?.pos ? this.spike.pos.z : (carrier ? carrier.pos.z : null),
        timer: this.spike?.state === 'planted' ? Math.max(0, (this.spike.detonateAt - now) / 1000) : 0,
        plantProgress: Math.min(1, (this.plantProgress || 0) / PLANT_TIME),
        defuseProgress: Math.min(1, (this.defuseProgress || 0) / DEFUSE_TIME),
        canPlant: !!canPlant,
        canDefuse: !!canDefuse,
        inSite: inSite ? inSite.id : null,
      },
      minimapPlayer: this.player ? { x: this.player.pos.x, z: this.player.pos.z, yaw: this.yaw } : null,
      allies,
      enemies,
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
      if (this.mode.id !== 'deathmatch') this.roundEndsAt = now + ROUND_TIME * 1000;
    }
    if (this.phase === 'live' && this.mode.id !== 'deathmatch') {
      if (this.spike.state === 'planted' && now >= this.spike.detonateAt) {
        this.audio.explosion();
        this.spawnBurst(this.spike.pos.clone().setY(1), 0xffa726, 24);
        this.endRound(this.playerAttacking, 'detonation');
      } else if (this.spike.state !== 'planted' && now >= this.roundEndsAt) {
        this.endRound(!this.playerAttacking, 'time');
      }
    }
    if (this.phase === 'live' && this.mode.id === 'deathmatch' && now >= this.matchEndsAt) {
      const myKills = this.kills.You || 0;
      const bestBot = Math.max(0, ...Object.entries(this.kills).filter(([n]) => n !== 'You').map(([, k]) => k));
      this.endMatch(myKills >= bestBot && myKills > 0);
    }

    // spike: channels, pickup, beeping, visuals
    if (this.phase === 'live' && this.mode.id !== 'deathmatch') {
      this.updatePlayerChannel(now);
      this.updateBotChannels(now);
      if (this.spike.state === 'dropped' && this.spike.pos) {
        if (this.player.alive && this.playerAttacking && this.player.pos.distanceTo(this.spike.pos) <= 1.2) {
          this.pickupSpike({ isPlayer: true });
        } else {
          for (const b of this.bots) {
            if (b.alive && this.botIsAttacker(b) && b.pos.distanceTo(this.spike.pos) <= 1.2) {
              this.pickupSpike(b);
              break;
            }
          }
        }
      }
      if (this.spike.state === 'planted') {
        const left = (this.spike.detonateAt - now) / 1000;
        const interval = left > 10 ? 1000 : 500;
        if (now - this.lastBeep >= interval) {
          this.lastBeep = now;
          this.audio.beep();
        }
      }
    }
    this.updateSpikeVisual(now);

    // healing
    if (now < this.healUntil && this.player.alive) {
      this.player.hp = Math.min(this.maxHp, this.player.hp + (50 / 3) * dt);
    }

    // player movement
    const ultActive = now < this.ultActiveUntil;
    if (this.phase === 'live' && this.player.alive) {
      const speed = this.agent.speed * (this.ads ? 0.5 : 1) * (ultActive ? 1.2 : 1);
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
      this.moving = wish.lengthSq() > 0;
      this.moveSpeed = speed;
    } else {
      this.player.vel.x *= Math.max(0, 1 - dt * 6);
      this.player.vel.z *= Math.max(0, 1 - dt * 6);
      this.moving = false;
    }
    this.player.vy -= 20 * dt;
    this.player.pos.x += this.player.vel.x * dt;
    this.player.pos.z += this.player.vel.z * dt;
    this.player.pos.y += this.player.vy * dt;
    if (this.player.pos.y <= 0) { this.player.pos.y = 0; this.player.vy = 0; this.player.grounded = true; }
    collideCircle(this.player.pos, 0.5, this.colliders);
    this.player.pos.x = Math.max(-ARENA.x, Math.min(ARENA.x, this.player.pos.x));
    this.player.pos.z = Math.max(-ARENA.z, Math.min(ARENA.z, this.player.pos.z));
    this.recoilPitch = Math.max(0, this.recoilPitch - dt * 0.22);
    this.camera.position.set(this.player.pos.x, this.player.pos.y + 1.6, this.player.pos.z);
    this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw, 0, 'YXZ');

    // FOV: dash boost > ADS zoom > default, eased
    const w = this.currentWeapon();
    const targetFov = now < this.dashFovUntil ? 82 : this.ads ? (w.adsFov || 55) : 75;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();

    // auto fire
    if (this.mouseDown && this.phase === 'live' && this.player.alive && this.currentWeapon().auto) {
      this.tryShoot();
    }
    // reload finish
    if (this.reloading && now >= this.reloadEndsAt) {
      this.reloading = false;
      const rw = this.currentWeapon();
      const take = Math.min(rw.mag - rw.ammo, rw.reserve);
      rw.ammo += take;
      rw.reserve -= take;
      this.cb.hud(this.snapshot());
    }
    // recoil + flash decay, viewmodel animation (bob, sway, ADS, reload dip)
    this.recoil = Math.max(0, this.recoil - dt * 0.25);
    this.swayX *= Math.max(0, 1 - dt * 6);
    this.swayY *= Math.max(0, 1 - dt * 6);
    if (this.viewmodel) {
      if (this.moving && this.player.grounded) this.bobPhase += dt * (this.moveSpeed || 5) * 1.6;
      const bobY = this.moving ? Math.sin(this.bobPhase * 2) * 0.008 : 0;
      const bobX = this.moving ? Math.cos(this.bobPhase) * 0.007 : 0;
      let dip = 0;
      if (this.reloading) {
        const t = 1 - Math.max(0, (this.reloadEndsAt - now) / (this.reloadTotal || 1));
        dip = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
      }
      const base = this.ads ? this.viewmodelAds : this.viewmodelBase;
      const k = Math.min(1, dt * 12);
      this.viewmodel.position.x += ((base.x + bobX + this.swayX) - this.viewmodel.position.x) * k;
      this.viewmodel.position.y += ((base.y + bobY - dip * 0.14) - this.viewmodel.position.y) * k;
      this.viewmodel.position.z = base.z + this.recoil;
      this.viewmodel.rotation.x = this.recoil * 1.5 - dip * 0.7 + this.swayY;
      this.viewmodel.rotation.y = this.swayX * 0.9;
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
