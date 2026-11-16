// AGENTSTRIKE — UI: screens, shop, gacha, HUD, results.
import { AGENTS, WEAPONS, SHOP_ITEMS, SKINS, RARITY, GACHA_COST, DUPLICATE_REFUND, MODES, ULT, getAgent, getWeapon, getSkin, getRankFor, rollSkin } from './data.js';
import { getSave, addCredits, spendCredits, addRankPoints, ownWeapon, ownSkin, ownItem, recordMatch } from './state.js';
import { Game, MAP_DATA } from './game.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

let game = null;
let selectedAgent = 'vex';
let selectedMode = 'ranked';
let matchActive = false;
let lastMatchCfg = null;

export function init() {
  $('btn-play').addEventListener('click', () => showScreen('agents'));
  $('btn-shop').addEventListener('click', () => { renderShop(); showScreen('shop'); });
  $('btn-gacha').addEventListener('click', () => { renderGacha(); showScreen('gacha'); });
  $('btn-agents-back').addEventListener('click', () => showScreen('menu'));
  $('btn-modes-back').addEventListener('click', () => showScreen('agents'));
  $('btn-shop-back').addEventListener('click', () => showScreen('menu'));
  $('btn-gacha-back').addEventListener('click', () => showScreen('menu'));
  $('btn-again').addEventListener('click', () => startMatch(lastMatchCfg));
  $('btn-results-shop').addEventListener('click', () => { renderShop(); showScreen('shop'); });
  $('btn-results-menu').addEventListener('click', () => showScreen('menu'));
  $('btn-resume').addEventListener('click', () => { $('pause-overlay').classList.add('hidden'); game?.lock(); });
  $('btn-quit').addEventListener('click', quitMatch);
  $('deploy-overlay').addEventListener('click', () => {
    $('deploy-overlay').classList.add('hidden');
    game?.lock();
  });
  $('btn-roll').addEventListener('click', doRoll);

  document.addEventListener('pointerlockchange', () => {
    if (!matchActive || !game) return;
    const locked = document.pointerLockElement === game.renderer.domElement;
    const deployHidden = $('deploy-overlay').classList.contains('hidden');
    if (!locked && deployHidden && game.phase === 'live' && game.player?.alive) {
      $('pause-overlay').classList.remove('hidden');
    } else if (locked) {
      $('pause-overlay').classList.add('hidden');
    }
  });
  // Safety net: Esc pauses even if pointer lock never engaged (some browsers
  // consume Esc for lock-exit without delivering the keydown; headless too).
  // Always release the lock first so the pause buttons are clickable.
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && matchActive && game && game.phase === 'live' && game.player?.alive) {
      document.exitPointerLock?.();
      $('pause-overlay').classList.remove('hidden');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' && matchActive) {
      e.preventDefault();
      $('scoreboard').classList.remove('hidden');
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Tab') $('scoreboard').classList.add('hidden');
  });

  renderAgents();
  renderModes();
  showScreen('menu');
}

function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) el.classList.remove('active');
  $('screen-' + name).classList.add('active');
  if (name === 'menu') renderMenu();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------- menu
function renderMenu() {
  const s = getSave();
  const rank = getRankFor(s.rankPoints);
  $('menu-credits').textContent = fmt(s.credits);
  $('menu-rank-name').textContent = rank.name;
  $('menu-rank-name').style.color = rank.css;
  $('menu-rank-points').textContent = fmt(s.rankPoints) + ' RP';
  const winRate = s.matchesPlayed ? Math.round((s.matchesWon / s.matchesPlayed) * 100) : 0;
  $('menu-stats').textContent =
    `${s.matchesPlayed} matches · ${winRate}% win rate · ${fmt(s.totalKills)} kills · best DM ${s.bestDeathmatchKills} kills`;
}

// ---------------------------------------------------------- agents
function renderAgents() {
  const grid = $('agent-grid');
  grid.innerHTML = '';
  for (const a of AGENTS) {
    const card = document.createElement('div');
    card.className = 'agent-card' + (a.id === selectedAgent ? ' selected' : '');
    card.style.setProperty('--agent', a.css);
    card.innerHTML = `
      <div class="agent-avatar" style="background:${a.css}">${a.name[0]}</div>
      <div class="agent-name">${a.name}</div>
      <div class="agent-title">${a.title}</div>
      <div class="agent-desc">${a.desc}</div>
      <div class="agent-stats">
        <span>HP ${a.hp}</span><span>SPD ${a.speed.toFixed(1)}</span>
      </div>
      <div class="agent-skill">
        <strong>${a.skill.name}</strong> <span class="key">${a.skill.key}</span>
        <div>${a.skill.desc}</div>
        <div class="muted">Cooldown ${a.skill.cooldown}s</div>
      </div>`;
    card.addEventListener('click', () => {
      selectedAgent = a.id;
      renderAgents();
      $('modes-agent-label').textContent = `Playing as ${a.name} — ${a.skill.name} ready on ${a.skill.key}`;
      showScreen('modes');
    });
    grid.appendChild(card);
  }
}

// ---------------------------------------------------------- modes
function renderModes() {
  const grid = $('mode-grid');
  grid.innerHTML = '';
  for (const m of MODES) {
    const card = document.createElement('div');
    card.className = 'mode-card';
    card.innerHTML = `
      <div class="mode-name">${m.name}</div>
      <div class="mode-tag">${m.tagline}</div>
      <div class="mode-desc">${m.desc}</div>
      <button class="btn primary">Deploy</button>`;
    card.querySelector('button').addEventListener('click', () => {
      selectedMode = m.id;
      startMatch({ mode: m.id, agent: selectedAgent });
    });
    grid.appendChild(card);
  }
}

// ---------------------------------------------------------- shop
function renderShop() {
  const s = getSave();
  $('shop-credits').textContent = fmt(s.credits);
  const wg = $('shop-weapons');
  wg.innerHTML = '';
  for (const w of WEAPONS) {
    const owned = s.ownedWeapons.includes(w.id);
    const equipped = s.equippedWeapon === w.id;
    const rpm = Math.round(60000 / w.fireInterval);
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `
      <div class="shop-name">${w.name} <span class="muted">${w.type}</span></div>
      <div class="shop-desc">${w.desc}</div>
      <div class="shop-stats">
        <span>DMG ${w.damage}${w.pellets > 1 ? '×' + w.pellets : ''}</span>
        <span>${w.auto ? rpm + ' RPM' : 'Semi'}</span>
        <span>MAG ${w.mag}</span>
      </div>
      <button class="btn ${equipped ? '' : 'primary'}" ${equipped ? 'disabled' : ''}>
        ${equipped ? 'Equipped' : owned ? 'Equip' : 'Buy — ' + fmt(w.price) + ' CR'}
      </button>`;
    card.querySelector('button').addEventListener('click', () => {
      const save = getSave();
      if (!save.ownedWeapons.includes(w.id)) {
        if (!spendCredits(w.price)) { toast('Not enough credits'); return; }
        ownWeapon(w.id);
        toast(`${w.name} purchased`);
      }
      save.equippedWeapon = w.id;
      localStorage.setItem('agentstrike_save_v1', JSON.stringify(save));
      renderShop();
    });
    wg.appendChild(card);
  }
  const ig = $('shop-items');
  ig.innerHTML = '';
  for (const it of SHOP_ITEMS) {
    const owned = s.ownedItems.includes(it.id);
    const equipped = s.equippedItems.includes(it.id);
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `
      <div class="shop-name">${it.name}</div>
      <div class="shop-desc">${it.desc}</div>
      <button class="btn ${equipped ? '' : 'primary'}">
        ${equipped ? 'Unequip' : owned ? 'Equip' : 'Buy — ' + fmt(it.price) + ' CR'}
      </button>`;
    card.querySelector('button').addEventListener('click', () => {
      const save = getSave();
      if (!save.ownedItems.includes(it.id)) {
        if (!spendCredits(it.price)) { toast('Not enough credits'); return; }
        ownItem(it.id);
        toast(`${it.name} purchased`);
      }
      if (save.equippedItems.includes(it.id)) {
        save.equippedItems = save.equippedItems.filter((x) => x !== it.id);
      } else {
        save.equippedItems.push(it.id);
      }
      localStorage.setItem('agentstrike_save_v1', JSON.stringify(save));
      renderShop();
    });
    ig.appendChild(card);
  }
}

// ---------------------------------------------------------- gacha
function renderGacha() {
  const s = getSave();
  $('gacha-credits').textContent = fmt(s.credits);
  $('btn-roll').textContent = `Roll — ${GACHA_COST} CR`;
  renderInventory();
  $('gacha-result').innerHTML = '<div class="muted">Spend 200 CR for a random weapon skin. Duplicates refund 50 CR.</div>';
}

function renderInventory() {
  const s = getSave();
  const grid = $('inventory-grid');
  grid.innerHTML = '';
  for (const skin of SKINS) {
    const owned = s.ownedSkins.includes(skin.id);
    const equipped = s.equippedSkin === skin.id;
    const r = RARITY[skin.rarity];
    const el = document.createElement('div');
    el.className = 'inv-item' + (owned ? '' : ' locked') + (equipped ? ' equipped' : '');
    el.style.borderColor = owned ? r.css : '#333';
    el.innerHTML = `
      <div class="inv-swatch" style="background:linear-gradient(135deg,#${skin.body.toString(16).padStart(6, '0')},#${skin.accent.toString(16).padStart(6, '0')})"></div>
      <div class="inv-name">${owned ? skin.name : '???'}</div>
      <div class="inv-rarity" style="color:${r.css}">${r.label}</div>
      ${owned ? `<button class="btn small" ${equipped ? 'disabled' : ''}>${equipped ? 'Equipped' : 'Equip'}</button>` : ''}`;
    const btn = el.querySelector('button');
    if (btn) btn.addEventListener('click', () => {
      const save = getSave();
      save.equippedSkin = skin.id;
      localStorage.setItem('agentstrike_save_v1', JSON.stringify(save));
      renderInventory();
      toast(`${skin.name} equipped`);
    });
    grid.appendChild(el);
  }
}

let rolling = false;
function doRoll() {
  if (rolling) return;
  if (!spendCredits(GACHA_COST)) { toast('Not enough credits'); return; }
  rolling = true;
  const s = getSave();
  s.rolls += 1;
  localStorage.setItem('agentstrike_save_v1', JSON.stringify(s));
  $('gacha-credits').textContent = fmt(getSave().credits);
  const result = rollSkin();
  const stage = $('gacha-stage');
  const resEl = $('gacha-result');
  resEl.innerHTML = '';
  stage.classList.add('spinning');
  const names = SKINS.filter((x) => x.id !== 'default').map((x) => x.name);
  let ticks = 0;
  const iv = setInterval(() => {
    stage.textContent = names[Math.floor(Math.random() * names.length)];
    stage.style.color = ['#9aa4b2', '#35a7ff', '#b46bff', '#ffb020'][Math.floor(Math.random() * 4)];
    ticks += 1;
    if (ticks > 16) {
      clearInterval(iv);
      stage.classList.remove('spinning');
      stage.textContent = result.name;
      const r = RARITY[result.rarity];
      stage.style.color = r.css;
      const isNew = ownSkin(result.id);
      let note;
      if (isNew) {
        note = 'New skin added to your inventory!';
      } else {
        addCredits(DUPLICATE_REFUND);
        note = `Duplicate — refunded ${DUPLICATE_REFUND} CR.`;
      }
      resEl.innerHTML = `<div class="gacha-reveal" style="border-color:${r.css}">
        <div class="gacha-rarity" style="color:${r.css}">${r.label}</div>
        <div class="gacha-name">${result.name}</div>
        <div class="muted">${note}</div>
        <div class="inv-swatch big" style="background:linear-gradient(135deg,#${result.body.toString(16).padStart(6, '0')},#${result.accent.toString(16).padStart(6, '0')})"></div>
      </div>`;
      $('gacha-credits').textContent = fmt(getSave().credits);
      renderInventory();
      rolling = false;
    }
  }, 75);
}

// ---------------------------------------------------------- match
function startMatch(cfg) {
  lastMatchCfg = cfg;
  const s = getSave();
  const mode = MODES.find((m) => m.id === cfg.mode) || MODES[0];
  if (game) { game.dispose(); game = null; }
  $('game-container').innerHTML = '';
  $('killfeed').innerHTML = '';
  $('recon-markers').innerHTML = '';
  $('pause-overlay').classList.add('hidden');
  $('dead-overlay').classList.add('hidden');
  $('scoreboard').classList.add('hidden');
  $('round-banner').classList.add('hidden');
  $('deploy-overlay').classList.remove('hidden');
  $('deploy-title').textContent = `${mode.name} — ${getAgent(cfg.agent).name}`;
  $('deploy-sub').textContent = 'Click to deploy. WASD move · Mouse aim · Click shoot · R reload · Q skill · X ult · E plant/defuse spike · Right-click ADS · Tab scoreboard';
  showScreen('match');
  game = new Game($('game-container'), {
    hud: updateHud,
    killfeed: addKillfeed,
    roundEnd: onRoundEnd,
    matchEnd: onMatchEnd,
    playerDied: () => { $('dead-overlay').classList.remove('hidden'); },
    playerRespawned: () => { $('dead-overlay').classList.add('hidden'); },
  });
  matchActive = true;
  game.startMatch({
    mode,
    agent: cfg.agent,
    weaponId: s.equippedWeapon,
    skinId: s.equippedSkin,
    items: s.equippedItems,
  });
  window.__agentstrike = game; // debug hook: inspect live match state
}

function quitMatch() {
  if (game) {
    addCredits(game.creditsEarned || 0);
    game.dispose();
    game = null;
  }
  matchActive = false;
  showScreen('menu');
}

const ROUND_REASONS = {
  elimination: 'ELIMINATION',
  detonation: 'SPIKE DETONATED',
  defuse: 'SPIKE DEFUSED',
  time: 'TIME EXPIRED',
};

function onRoundEnd({ won, rounds, reason }) {
  const b = $('round-banner');
  $('round-banner-text').textContent = won ? 'ROUND WON' : 'ROUND LOST';
  $('round-banner-sub').textContent = ROUND_REASONS[reason] || '';
  b.className = 'banner ' + (won ? 'win' : 'lose');
  b.classList.remove('hidden');
  setTimeout(() => b.classList.add('hidden'), 2400);
}

function onMatchEnd(result) {
  matchActive = false;
  const s = getSave();
  addCredits(result.credits);
  if (result.rp) addRankPoints(result.rp);
  recordMatch({ won: result.won, kills: result.kills, mode: result.mode });
  if (game) { game.dispose(); game = null; }
  const rank = getRankFor(getSave().rankPoints);
  $('results-title').textContent = result.won ? 'VICTORY' : 'DEFEAT';
  $('results-title').className = 'results-title ' + (result.won ? 'win' : 'lose');
  const modeName = (MODES.find((m) => m.id === result.mode) || {}).name || result.mode;
  $('results-subtitle').textContent = `${modeName} · ${getAgent(lastMatchCfg.agent).name}`;
  const kd = result.deaths ? (result.kills / result.deaths).toFixed(2) : result.kills.toFixed(2);
  const scoreRows = result.rounds
    ? `<div>Rounds</div><div><strong>${result.rounds.us} — ${result.rounds.them}</strong></div>` : '';
  $('results-stats').innerHTML = `
    <div>Kills</div><div><strong>${result.kills}</strong></div>
    <div>Deaths</div><div><strong>${result.deaths}</strong></div>
    <div>K/D</div><div><strong>${kd}</strong></div>
    ${scoreRows}
    <div>Rank</div><div><strong style="color:${rank.css}">${rank.name}</strong> · ${fmt(getSave().rankPoints)} RP</div>`;
  $('results-rewards').innerHTML =
    `+${fmt(result.credits)} credits earned${result.rp ? ` · +${result.rp} RP` : ''}`;
  const sb = $('results-scoreboard');
  sb.innerHTML = '<div class="sb-head"><span>Player</span><span>K</span><span>D</span></div>' +
    result.scoreboard.map((r) =>
      `<div class="sb-row ${r.team}"><span>${r.name}</span><span>${r.kills}</span><span>${r.deaths}</span></div>`).join('');
  showScreen('results');
}

function addKillfeed({ killer, victim, weapon, headshot }) {
  const el = document.createElement('div');
  el.className = 'kf-entry';
  el.innerHTML = `<span class="kf-killer">${killer}</span> <span class="kf-weapon">${headshot ? '☠ ' : ''}${weapon}</span> <span class="kf-victim">${victim}</span>`;
  $('killfeed').prepend(el);
  setTimeout(() => el.classList.add('fade'), 4000);
  setTimeout(() => el.remove(), 5000);
  while ($('killfeed').children.length > 5) $('killfeed').lastChild.remove();
}

// ---------------------------------------------------------- minimap
function drawMinimap(s) {
  const cv = $('minimap');
  if (!cv || !s.minimapPlayer) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const bx = MAP_DATA.bounds.x + 2, bz = MAP_DATA.bounds.z + 2;
  const sx = (x) => ((x + bx) / (bx * 2)) * W;
  const sz = (z) => ((z + bz) / (bz * 2)) * H;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(8, 10, 16, 0.88)';
  ctx.fillRect(0, 0, W, H);
  // sites
  for (const site of MAP_DATA.sites) {
    ctx.fillStyle = site.id === 'A' ? 'rgba(53, 167, 255, 0.28)' : 'rgba(255, 70, 85, 0.28)';
    ctx.fillRect(sx(site.x - site.w / 2), sz(site.z - site.d / 2), (site.w / (bx * 2)) * W, (site.d / (bz * 2)) * H);
    ctx.fillStyle = site.css;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(site.id, sx(site.x), sz(site.z) + 4);
  }
  // walls
  ctx.fillStyle = '#5a6274';
  for (const w of MAP_DATA.walls) {
    ctx.fillRect(sx(w.x - w.w / 2), sz(w.z - w.d / 2),
      Math.max(1, (w.w / (bx * 2)) * W), Math.max(1, (w.d / (bz * 2)) * H));
  }
  const dot = (x, z, color, r = 3) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx(x), sz(z), r, 0, Math.PI * 2);
    ctx.fill();
  };
  const diamond = (x, z, color, r = 5) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sx(x), sz(z) - r);
    ctx.lineTo(sx(x) + r, sz(z));
    ctx.lineTo(sx(x), sz(z) + r);
    ctx.lineTo(sx(x) - r, sz(z));
    ctx.closePath();
    ctx.fill();
  };
  // spike (dropped / planted — carried rides on its carrier)
  const sp = s.spike;
  if (sp && sp.state !== 'carried' && sp.x !== null) {
    diamond(sp.x, sp.z, sp.state === 'planted' ? '#ff4655' : '#ffb020', sp.state === 'planted' ? 6 : 5);
  }
  // teammates
  for (const a of s.allies || []) {
    if (!a.alive) continue;
    dot(a.x, a.z, '#2ee6a8');
    if (a.carrier) diamond(a.x, a.z, '#ffb020', 4);
  }
  // visible enemies only
  for (const e of s.enemies || []) {
    if (!e.alive || !e.visible) continue;
    dot(e.x, e.z, '#ff4655');
    if (e.carrier) diamond(e.x, e.z, '#ffb020', 4);
  }
  // player arrow (position + facing)
  const p = s.minimapPlayer;
  const px = sx(p.x), py = sz(p.z);
  const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw);
  const ang = Math.atan2(dz, dx);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px + Math.cos(ang) * 8, py + Math.sin(ang) * 8);
  ctx.lineTo(px + Math.cos(ang + 2.5) * 6, py + Math.sin(ang + 2.5) * 6);
  ctx.lineTo(px + Math.cos(ang - 2.5) * 6, py + Math.sin(ang - 2.5) * 6);
  ctx.closePath();
  ctx.fill();
  if (sp && sp.playerCarries) diamond(p.x, p.z, '#ffb020', 4);
}

function updateHud(s) {
  if (!matchActive) return;
  // health + armor
  const hpPct = Math.max(0, (s.hp / s.maxHp) * 100);
  $('hud-health-fill').style.width = hpPct + '%';
  $('hud-health-fill').style.background = hpPct > 50 ? '#2ee6a8' : hpPct > 25 ? '#ffb020' : '#ff4655';
  $('hud-health-text').textContent = `${Math.ceil(s.hp)} / ${s.maxHp}`;
  $('hud-armor').textContent = s.maxArmor > 0 ? `🛡 ${Math.ceil(s.armor)}` : '';
  // ammo + weapon
  $('hud-ammo').textContent = s.reloading ? 'RELOADING…' : `${s.ammo} / ${s.mag}`;
  $('hud-reserve').textContent = `RESERVE ${s.reserve}`;
  $('hud-weapon').textContent = s.weaponName + (s.scoped ? ' · ADS' : '');
  $('crosshair').classList.toggle('ads-hidden', !!s.adsScoped);
  $('hud-credits').textContent = '+' + fmt(s.credits) + ' CR';
  // skill
  const skillBox = $('hud-skill-box');
  if (s.skillCooldown > 0) {
    skillBox.classList.add('cooling');
    $('hud-skill-cool').textContent = s.skillCooldown.toFixed(0) + 's';
    $('hud-skill-fill').style.height = ((1 - s.skillCooldown / s.skillTotal) * 100) + '%';
  } else {
    skillBox.classList.remove('cooling');
    $('hud-skill-cool').textContent = 'READY';
    $('hud-skill-fill').style.height = '100%';
  }
  $('hud-skill-name').textContent = s.skillName;
  // ultimate
  const ultBox = $('hud-ult-box');
  ultBox.classList.toggle('ready', !!s.ultReady && !s.ultActive);
  ultBox.classList.toggle('active', !!s.ultActive);
  const pips = ultBox.querySelectorAll('.pip');
  pips.forEach((pip, i) => pip.classList.toggle('lit', i < s.ultCharge));
  $('hud-ult-name').textContent = ULT.name;
  $('hud-ult-state').textContent = s.ultActive ? `${s.ultLeft.toFixed(0)}s` : s.ultReady ? 'READY' : `${s.ultCharge}/${s.ultNeeded}`;
  // score bar
  const sideEl = $('hud-side');
  if (s.mode === 'deathmatch') {
    $('hud-score-us').textContent = s.kills;
    $('hud-score-them').textContent = s.killTarget;
    $('hud-round').textContent = 'DEATHMATCH';
    $('hud-target').textContent = 'FIRST TO ' + s.killTarget;
    sideEl.textContent = 'FFA';
    sideEl.classList.remove('def');
    $('hud-alive').textContent = '';
  } else {
    $('hud-score-us').textContent = s.rounds.us;
    $('hud-score-them').textContent = s.rounds.them;
    $('hud-round').textContent = `ROUND ${s.round}`;
    $('hud-target').textContent = `FIRST TO ${s.roundsToWin}`;
    const atk = s.side === 'attack';
    sideEl.textContent = atk ? 'ATK' : 'DEF';
    sideEl.classList.toggle('def', !atk);
    $('hud-alive').textContent = `Alive ${s.alliesAlive} vs ${s.enemiesAlive}`;
  }
  const t = Math.ceil(s.timer);
  $('hud-timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  // spike timer (planted)
  const st = $('hud-spike-timer');
  if (s.spike && s.spike.state === 'planted') {
    const left = Math.ceil(s.spike.timer);
    st.textContent = `SPIKE ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    st.classList.remove('hidden');
  } else {
    st.classList.add('hidden');
  }
  // spike status line
  const ss = $('spike-status');
  if (s.mode === 'deathmatch' || !s.spike) {
    ss.textContent = '';
    ss.className = '';
  } else if (s.spike.state === 'planted') {
    ss.textContent = `SPIKE PLANTED — SITE ${s.spike.site}`;
    ss.className = 'planted';
  } else if (s.spike.playerCarries) {
    ss.textContent = 'YOU HAVE THE SPIKE — plant it on A or B';
    ss.className = '';
  } else if (s.spike.state === 'dropped') {
    ss.textContent = 'SPIKE DROPPED — pick it up';
    ss.className = '';
  } else if (s.spike.carrierName) {
    ss.textContent = `${s.spike.carrierName.toUpperCase()} HAS THE SPIKE`;
    ss.className = '';
  } else {
    ss.textContent = '';
    ss.className = '';
  }
  // interact prompt + channel progress
  const prompt = $('interact-prompt');
  const prog = $('spike-progress');
  if (s.spike && s.spike.plantProgress > 0) {
    prompt.classList.add('hidden');
    prog.classList.remove('hidden');
    $('spike-progress-label').textContent = 'PLANTING…';
    $('spike-progress-fill').style.width = (s.spike.plantProgress * 100) + '%';
  } else if (s.spike && s.spike.defuseProgress > 0) {
    prompt.classList.add('hidden');
    prog.classList.remove('hidden');
    $('spike-progress-label').textContent = 'DEFUSING…';
    $('spike-progress-fill').style.width = (s.spike.defuseProgress * 100) + '%';
  } else if (s.spike && s.spike.canPlant) {
    prog.classList.add('hidden');
    prompt.classList.remove('hidden');
    $('interact-text').textContent = `to plant the spike — Site ${s.spike.inSite}`;
  } else if (s.spike && s.spike.canDefuse) {
    prog.classList.add('hidden');
    prompt.classList.remove('hidden');
    $('interact-text').textContent = 'to defuse the spike';
  } else {
    prompt.classList.add('hidden');
    prog.classList.add('hidden');
  }
  // minimap
  drawMinimap(s);
  // countdown
  if (s.phase === 'countdown') {
    $('countdown').textContent = Math.ceil(s.countdown);
    $('countdown').classList.remove('hidden');
  } else {
    $('countdown').classList.add('hidden');
  }
  if (s.phase === 'live') $('round-banner').classList.add('hidden');
  // recon markers
  const rm = $('recon-markers');
  rm.innerHTML = '';
  for (const m of s.markers) {
    const d = document.createElement('div');
    d.className = 'recon-marker';
    d.style.left = (m.x * 100) + '%';
    d.style.top = (m.y * 100) + '%';
    d.textContent = '◆ ' + m.name;
    rm.appendChild(d);
  }
  // scoreboard rows
  if (s.scoreboard) {
    $('scoreboard-rows').innerHTML = s.scoreboard.map((r) =>
      `<div class="sb-row ${r.team}"><span>${r.name}</span><span>${r.kills}</span><span>${r.deaths}</span></div>`).join('');
  }
  // flashes
  if (s.damaged) {
    const v = $('damage-flash');
    v.classList.remove('show');
    void v.offsetWidth;
    v.classList.add('show');
  }
  if (s.hitmarker) {
    const h = $('hitmarker');
    h.classList.remove('show');
    void h.offsetWidth;
    h.classList.add('show');
    h.style.color = s.headshot ? '#ffb020' : '#fff';
  }
  if (s.creditGain) toast(`+${s.creditGain} CR`);
  if (s.skillUsed) toast(`${s.skillUsed} activated`);
  if (s.notice) toast(s.notice);
}

// ---------------------------------------------------------- toast
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}
