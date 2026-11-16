# AGENTSTRIKE — Tactical FPS

A Valorant-like tactical FPS built with three.js. Pick an agent with a unique
skill, buy weapons, roll the skin gacha, and climb the ranked ladder — all
single-player against AI bots. No build step, no server, no multiplayer.

## Play

Open `index.html` via any static server (ES modules + importmap need HTTP):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## What's in the game

**Agents** (each with a unique skill on `Q`, different HP/speed):
- **VEX** — Phase Dash (quick dash), 80 HP, fastest
- **NOVA** — Nano Mend (heal 50 HP over 3s), 100 HP
- **ORION** — Smoke Screen (blocks enemy sightlines for 6s), 130 HP
- **LYNX** — Recon Pulse (reveals enemies through walls for 5s), 90 HP

**Shop + Gacha**
- Earn credits from kills (+100), round wins (+300) and match wins.
- Buy 5 weapons (Classic, Spectre, Phantom, Judge, Operator with scope) and
  gear (Extended Mag, Light Grip, Reinforced Vest) — all with real stat effects.
- Gacha: 200 CR per roll for weapon skins in 4 rarity tiers
  (Common 60% / Rare 25% / Epic 10% / Legendary 5%), with roll animation,
  duplicate refunds, inventory and equip. Skins recolor your in-game weapon.

**Modes**
- **Ranked** — 3v3 team elimination, first to 5 rounds. Wins earn +100 RP;
  rank tiers (Iron → Immortal) persist in localStorage.
- **Unranked** — 3v3, first to 3 rounds, no rank stakes.
- **Deathmatch** — free-for-all vs 4 bots, first to 20 kills or best score
  when the 5:00 timer ends. Instant respawns.

**Core FPS**: pointer-lock mouse aim, WASD + jump, click to shoot, reload,
weapon switching (1/2/wheel), bots that move, strafe and shoot back,
hitmarkers, kill feed, scoreboard (Tab), round/match-end screens, and a
synthesized WebAudio sound set (no audio files).

## Files

- `index.html` — entry point, all screens + HUD
- `style.css` — UI styling
- `js/data.js` — agents, weapons, shop, gacha pool, ranks
- `js/state.js` — localStorage save (credits, inventory, rank)
- `js/game.js` — three.js engine: map, player, bot AI, weapons, skills
- `js/ui.js` — screens, shop, gacha, HUD wiring, results
- `js/main.js` — bootstrap
- `js/vendor/three.module.js` — three.js r160, vendored (MIT) so the game
  runs fully offline with zero CDN dependency

## License

MIT — see `LICENSE`.
