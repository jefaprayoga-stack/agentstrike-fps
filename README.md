# AGENTSTRIKE — Tactical FPS

A Valorant-like tactical FPS built with three.js. Pick an agent with a unique
skill, buy weapons, roll the skin gacha, and climb the ranked ladder — all
single-player against AI bots. No build step, no server, no multiplayer.

## Play

Serve `game/` with any static server (ES modules + importmap need HTTP):

```bash
node serve.ts
# then open http://localhost:8080
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

- `main.ts` — entry program: copies `game/` and `screenshots/` to `/output`
  and writes `/output/dossier.json` (see `vendor/makefun-threejs.ts`)
- `serve.ts` — tiny static server for `game/` on http://localhost:8080
- `shots.json` — the 4 screenshots and the URLs they were captured from
- `game/index.html` — entry point, all screens + HUD
- `game/style.css` — UI styling
- `game/js/data.js` — agents, weapons, shop, gacha pool, ranks
- `game/js/state.js` — localStorage save (credits, inventory, rank)
- `game/js/game.js` — three.js engine: map, player, bot AI, weapons, skills
- `game/js/ui.js` — screens, shop, gacha, HUD wiring, results
- `game/js/main.js` — bootstrap
- `game/vendor/three/` — three.js 0.187.0, minified, vendored from the
  competition kit (MIT) so the game runs fully offline with zero CDN dependency

## License

MIT — see `LICENSE`.
