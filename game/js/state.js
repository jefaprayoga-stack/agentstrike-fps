// AGENTSTRIKE — persistent save state (localStorage).

const KEY = 'agentstrike_save_v1';

const DEFAULTS = {
  credits: 600,
  ownedWeapons: ['classic'],
  equippedWeapon: 'classic',
  ownedSkins: ['default'],
  equippedSkin: 'default',
  ownedItems: [],
  equippedItems: [],
  rankPoints: 0,
  matchesPlayed: 0,
  matchesWon: 0,
  totalKills: 0,
  bestDeathmatchKills: 0,
  rolls: 0,
};

let save = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSave() {
  return save;
}

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable (private mode) — play session-only.
  }
}

export function addCredits(n) {
  save.credits = Math.max(0, save.credits + n);
  persist();
  return save.credits;
}

export function spendCredits(n) {
  if (save.credits < n) return false;
  save.credits -= n;
  persist();
  return true;
}

export function addRankPoints(n) {
  save.rankPoints = Math.max(0, save.rankPoints + n);
  persist();
  return save.rankPoints;
}

export function ownWeapon(id) {
  if (!save.ownedWeapons.includes(id)) save.ownedWeapons.push(id);
  persist();
}

export function ownSkin(id) {
  if (!save.ownedSkins.includes(id)) {
    save.ownedSkins.push(id);
    persist();
    return true; // new
  }
  return false; // duplicate
}

export function ownItem(id) {
  if (!save.ownedItems.includes(id)) save.ownedItems.push(id);
  persist();
}

export function recordMatch({ won, kills, mode }) {
  save.matchesPlayed += 1;
  if (won) save.matchesWon += 1;
  save.totalKills += kills;
  if (mode === 'deathmatch' && kills > save.bestDeathmatchKills) {
    save.bestDeathmatchKills = kills;
  }
  persist();
}
