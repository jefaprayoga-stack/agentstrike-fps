// AGENTSTRIKE — game data: agents, weapons, shop items, gacha pool, ranks.
// All original content written for this entry.

export const AGENTS = [
  {
    id: 'vex',
    name: 'VEX',
    title: 'Phantom Duelist',
    color: 0x9b5cff,
    css: '#9b5cff',
    hp: 80,
    speed: 6.4,
    desc: 'A blink-fast duelist who slips through enemy lines before anyone can react.',
    skill: {
      id: 'dash',
      name: 'Phase Dash',
      key: 'Q',
      cooldown: 12,
      desc: 'Dash a short distance in your movement direction. Great for entry frags and escapes.',
    },
  },
  {
    id: 'nova',
    name: 'NOVA',
    title: 'Combat Medic',
    color: 0x2ee6a8,
    css: '#2ee6a8',
    hp: 100,
    speed: 5.6,
    desc: 'Keeps the squad alive. Patches herself up mid-fight and never goes down easy.',
    skill: {
      id: 'heal',
      name: 'Nano Mend',
      key: 'Q',
      cooldown: 20,
      desc: 'Restore 50 HP over 3 seconds.',
    },
  },
  {
    id: 'orion',
    name: 'ORION',
    title: 'Heavy Sentinel',
    color: 0xff8c2e,
    css: '#ff8c2e',
    hp: 130,
    speed: 4.9,
    desc: 'A walking wall. Drops smoke to cut sightlines and holds ground no matter what.',
    skill: {
      id: 'smoke',
      name: 'Smoke Screen',
      key: 'Q',
      cooldown: 18,
      desc: 'Launch a smoke cloud at your crosshair. Enemies cannot see through it for 6 seconds.',
    },
  },
  {
    id: 'lynx',
    name: 'LYNX',
    title: 'Recon Hunter',
    color: 0x35c8ff,
    css: '#35c8ff',
    hp: 90,
    speed: 5.9,
    desc: 'Nothing hides from LYNX. Her pulse paints every enemy on your screen.',
    skill: {
      id: 'recon',
      name: 'Recon Pulse',
      key: 'Q',
      cooldown: 22,
      desc: 'Reveal all enemies through walls for 5 seconds.',
    },
  },
];

export const WEAPONS = [
  {
    id: 'classic',
    name: 'Classic',
    type: 'Sidearm',
    damage: 24,
    headshotMult: 2,
    fireInterval: 220,
    auto: false,
    mag: 12,
    reloadMs: 1200,
    spread: 0.012,
    range: 60,
    price: 0,
    pellets: 1,
    adsFov: 55,
    desc: 'Reliable starter pistol. Free, always in your loadout.',
  },
  {
    id: 'spectre',
    name: 'Spectre',
    type: 'SMG',
    damage: 17,
    headshotMult: 1.8,
    fireInterval: 95,
    auto: true,
    mag: 30,
    reloadMs: 1600,
    spread: 0.03,
    range: 45,
    price: 400,
    pellets: 1,
    adsFov: 55,
    desc: 'Bullet hose. Shreds up close, sprays at range.',
  },
  {
    id: 'ak47',
    name: 'AK-47',
    type: 'Rifle',
    damage: 33,
    headshotMult: 2,
    fireInterval: 140,
    auto: true,
    mag: 30,
    reloadMs: 2000,
    spread: 0.02,
    range: 70,
    price: 650,
    pellets: 1,
    adsFov: 42,
    desc: 'The Kalashnikov. Curved 30-round mag, wooden furniture, hits like a truck.',
  },
  {
    id: 'phantom',
    name: 'M4 Carbine',
    type: 'Rifle',
    damage: 31,
    headshotMult: 2,
    fireInterval: 125,
    auto: true,
    mag: 25,
    reloadMs: 1800,
    spread: 0.016,
    range: 70,
    price: 800,
    pellets: 1,
    adsFov: 42,
    desc: 'M4 carbine: flat-top rail, crisp iron sights. The workhorse rifle. Precise, punchy, quiet.',
  },
  {
    id: 'judge',
    name: 'Judge',
    type: 'Shotgun',
    damage: 13,
    headshotMult: 1.5,
    fireInterval: 650,
    auto: false,
    mag: 7,
    reloadMs: 2200,
    spread: 0.075,
    range: 22,
    price: 700,
    pellets: 6,
    adsFov: 55,
    desc: 'Six pellets of bad news. Devastating in tight corners.',
  },
  {
    id: 'operator',
    name: 'Operator',
    type: 'Sniper',
    damage: 130,
    headshotMult: 2,
    fireInterval: 1200,
    auto: false,
    mag: 5,
    reloadMs: 2800,
    spread: 0.001,
    range: 120,
    price: 1200,
    pellets: 1,
    scope: true,
    adsFov: 28,
    desc: 'One shot, one kill. Right-click to scope.',
  },
];

// Shop attachments: small stat effects, equipped from the shop.
export const SHOP_ITEMS = [
  {
    id: 'extmag',
    name: 'Extended Mag',
    price: 300,
    desc: '+50% magazine size on your equipped weapon.',
    apply: { magMult: 1.5 },
  },
  {
    id: 'grip',
    name: 'Light Grip',
    price: 250,
    desc: '+15% fire rate on your equipped weapon.',
    apply: { fireRateMult: 1.15 },
  },
  {
    id: 'vest',
    name: 'Reinforced Vest',
    price: 350,
    desc: '+25 armor: absorbs half the damage you take until it breaks.',
    apply: { armor: 25 },
  },
];

// Gacha skins. Rarity weights: common 60, rare 25, epic 10, legendary 5.
export const SKINS = [
  { id: 'default', name: 'Factory Standard', rarity: 'common', body: 0x3d4658, accent: 0x9aa4b8, glow: 0x000000, price: 0 },
  { id: 'ash', name: 'Ash Camo', rarity: 'common', body: 0x55504a, accent: 0x9a938a, glow: 0x000000 },
  { id: 'olive', name: 'Olive Drab', rarity: 'common', body: 0x4a5240, accent: 0x8a9a6a, glow: 0x000000 },
  { id: 'slate', name: 'Slate Blue', rarity: 'common', body: 0x3a4a5a, accent: 0x7a9aba, glow: 0x000000 },
  { id: 'crimson', name: 'Crimson Phantom', rarity: 'rare', body: 0x7a1020, accent: 0xff3040, glow: 0x330000 },
  { id: 'glacier', name: 'Glacier', rarity: 'rare', body: 0xbfe8ff, accent: 0x35c8ff, glow: 0x0a2a3a },
  { id: 'volt', name: 'Volt Surge', rarity: 'rare', body: 0x222222, accent: 0xffe135, glow: 0x3a3000 },
  { id: 'nebula', name: 'Nebula', rarity: 'epic', body: 0x2a1a4a, accent: 0xb46bff, glow: 0x1a0a2a },
  { id: 'inferno', name: 'Inferno', rarity: 'epic', body: 0x3a0a00, accent: 0xff6a00, glow: 0x3a1000 },
  { id: 'voidreaper', name: 'Void Reaper', rarity: 'legendary', body: 0x0a0a12, accent: 0x00ffcc, glow: 0x003a2a },
  { id: 'neondragon', name: 'Neon Dragon', rarity: 'legendary', body: 0x101828, accent: 0xff2e88, glow: 0x2a0018 },
];

export const RARITY = {
  common: { label: 'Common', css: '#9aa4b2', weight: 60 },
  rare: { label: 'Rare', css: '#35a7ff', weight: 25 },
  epic: { label: 'Epic', css: '#b46bff', weight: 10 },
  legendary: { label: 'Legendary', css: '#ffb020', weight: 5 },
};

export const GACHA_COST = 200;
export const DUPLICATE_REFUND = 50;

export const RANKS = [
  { name: 'Iron', min: 0, css: '#8a8f98' },
  { name: 'Bronze', min: 200, css: '#c47a3a' },
  { name: 'Silver', min: 500, css: '#c0c8d0' },
  { name: 'Gold', min: 900, css: '#f2c14e' },
  { name: 'Platinum', min: 1400, css: '#4fd1c5' },
  { name: 'Diamond', min: 2000, css: '#6ab8ff' },
  { name: 'Immortal', min: 3000, css: '#ff4d6d' },
];

export const MODES = [
  {
    id: 'ranked',
    name: 'Ranked',
    tagline: 'First to 5 rounds · plant or defuse the spike · 3v3',
    desc: 'Attackers plant the spike on site A or B, defenders stop them. Sides swap at halftime. Wins earn +100 Rank Points, losses +20. Climb from Iron to Immortal.',
    roundsToWin: 5,
    teamSize: 3,
  },
  {
    id: 'unranked',
    name: 'Unranked',
    tagline: 'First to 3 rounds · plant or defuse the spike · 3v3',
    desc: 'Same tactical spike rounds, no rank on the line. Warm up, try agents, have fun.',
    roundsToWin: 3,
    teamSize: 3,
  },
  {
    id: 'deathmatch',
    name: 'Deathmatch',
    tagline: 'First to 20 kills · respawn · 5:00 cap',
    desc: 'Pure aim duel against 4 bots. Instant respawns, no rounds, most kills wins.',
    killTarget: 20,
    timeLimit: 300,
    teamSize: 1,
  },
];

// Ultimate: charges with kills (3 to fill), activated with X. Same for all
// agents: 8 seconds of faster fire, faster movement, and an instant +50 HP.
export const ULT = {
  name: 'Overdrive',
  key: 'X',
  chargeNeeded: 3,
  duration: 8,
  desc: '8s of +40% fire rate, +20% speed and +50 HP. Charges with kills.',
};

export const BOT_NAMES = [
  'Rook', 'Havoc', 'Sable', 'Mira', 'Knox', 'Ivy', 'Dusk', 'Fang',
  'Onyx', 'Raze', 'Pip', 'Volt', 'Ash', 'Nox', 'Jett', 'Cypher',
];

export function getAgent(id) {
  return AGENTS.find((a) => a.id === id) || AGENTS[0];
}

export function getWeapon(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}

export function getSkin(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

export function getRankFor(points) {
  let rank = RANKS[0];
  for (const r of RANKS) if (points >= r.min) rank = r;
  return rank;
}

export function rollSkin(rng = Math.random) {
  const roll = rng() * 100;
  let rarity = 'common';
  if (roll >= 95) rarity = 'legendary';
  else if (roll >= 85) rarity = 'epic';
  else if (roll >= 60) rarity = 'rare';
  const pool = SKINS.filter((s) => s.rarity === rarity && s.id !== 'default');
  return pool[Math.floor(rng() * pool.length)];
}
