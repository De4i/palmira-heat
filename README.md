[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/De4i/palmira-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/De4i/palmira-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# PALMIRA HEAT

An original 3D open-world crime game that runs in a desktop browser from static
files — no build step, no network requests. Built for the make.fun bounty
gta6-01 ("Make GTA 6"). Palmira is a fictional sun-soaked coastal city; every
name, character, vehicle, mission and sound in it was invented for this game.

## Play it

```
node serve.ts
```

then open http://localhost:8080 (keyboard + mouse).

You are **Rico Alvarez**, a small-time wheelman fresh off the boat. Take jobs
from Marisol Vega and her crew, work through a chain of **8 story missions**,
steal cars, outrun the Palmira PD, and build cash and reputation.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse (drag or pointer lock) | Camera |
| Shift | Run / boost |
| E | Enter or exit a car (walk up to one to steal it) |
| F or left click | Punch |
| Left click (with pistol) | Shoot |
| Space | Handbrake |
| P or Esc | Pause |
| M | Mute |

## What is in the city

- Four districts on one road grid: the **beachfront** (west, sand and ocean),
  **downtown** towers, the **marina** (south-east, docks and boats) and the
  pastel **suburbs**, with palms, streetlights and traffic throughout.
- Traffic AI that cruises the grid, brakes and honks; pedestrians on the
  sidewalks who panic and run from trouble.
- A 5-star wanted system: patrol cars chase and ram, roadblocks appear from
  3 stars, a police helicopter joins at 4–5 stars. Break line of sight and
  stay hidden to cool the heat down.
- Fists and a pistol, health, cash/rep progression, and a localStorage save
  (mission progress, cash, rep, pistol unlock).

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output folder and writes `dossier.json` with the vendored make.fun library.
- `game/` — the playable game. `game/vendor/three.min.js` is three.js r128
  (vendored, MIT). Everything else under `game/src/` is hand-written for this
  game, one job per file: `city.js` builds Palmira, `vehicles.js` the cars,
  `traffic.js`, `pedestrians.js`, `police.js`, `missions.js`, `combat.js`,
  `hud.js`, `audio.js`, `save.js`, `shots.js` (deterministic screenshot
  scenes behind `?shot=<scene>&seed=<n>`).
- `screenshots/` — four real renders of the running game, produced from the
  `?shot=` scenes listed in `shots.json`.

## Determinism

`node main.ts` copies files verbatim, so two runs produce a byte-identical
`dossier.json`.
