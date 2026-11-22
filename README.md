[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/De4i/palmira-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/De4i/palmira-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# PALMIRA HEAT

Palmira Heat is an original open-world crime game written in JavaScript with
three.js. It plays in a desktop browser straight from static files: there is no
build step and the game makes no network requests once it loads. The setting is
Palmira, a made-up coastal city where the sun never really sets on the pastel
towers — and every person, car, street name and job in it was invented for this
project.

You play Rico Alvarez, a wheelman who has just stepped off a boat with empty
pockets. Work for Marisol Vega's beachfront crew, earn cash and reputation, and
turn Rico into the driver Palmira talks about.

## What you can do in Palmira

- Roam one continuous road grid with four distinct districts: the beachfront
  promenade in the west, the downtown towers, the marina with its docks and
  boats in the south-east, and the quiet suburbs, all dressed with palms,
  streetlights and painted ground.
- Steal and drive any car you can reach. Traffic cruises the grid on its own,
  braking for trouble and leaning on the horn, while pedestrians stroll the
  sidewalks and scatter when things get loud.
- Answer to a five-star wanted system. Patrol cars hunt and ram you, the PD
  throws up roadblocks from three stars, and a police helicopter joins the
  chase at four stars and above. Break their line of sight, stay out of view,
  and the heat slowly cools; get cornered at walking pace for too long and you
  are busted.
- Fight with fists from the start and with a pistol once Marisol trusts you
  with one — rival Harbor Kings thugs included.
- Run a chained story of **8 jobs for Marisol Vega**: a first stolen car, a
  package run, a courier takedown, a timed checkpoint sprint, a heat-escape to
  a hideout garage, a marina warehouse heist, turf fights on three corners,
  and a finale run to the far pier with every badge in the city behind you.
- Read the city at a glance from the HUD: health, cash, reputation, wanted
  stars, the current objective, and a live minimap that tracks you, your
  objective and the police.
- Keep your progress: mission state, cash, reputation and the pistol unlock
  are saved to localStorage and picked up again on your next visit.

## Play

You need Node.js (22 or newer) for the tiny development server:

```
node serve.ts
```

Then open http://localhost:8080 in a desktop browser and press Start (or hit
Enter). The game is played with keyboard and mouse.

| Input | What it does |
| --- | --- |
| W A S D or arrow keys | Walk / drive |
| Mouse drag | Swing the camera |
| Shift | Run on foot |
| E | Get into a car (walk up to one to steal it) / get out |
| F, or a short mouse click | Punch — or fire the pistol once you have it |
| Space | Handbrake while driving |
| P or Esc | Pause / resume |
| M | Mute / unmute |
| Enter | Start from the menu |

## The bounty

This game is an entry to the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01).

## Tech notes

Everything playable lives under `game/` as plain static files. three.js r128
is vendored, unmodified, at `game/vendor/three.min.js`; the game's own code is
split into one-job-per-file ES modules under `game/src/` (city, vehicles,
traffic, pedestrians, player, police, missions, combat, HUD, audio, save and
the deterministic `?shot=` screenshot scenes). At the repository root,
`main.ts` is the hand-in program: it copies `game/` and `screenshots/` into
the output folder and writes `dossier.json` using the kit's dossier builder
(`vendor/makefun-game.ts`). Because the copy is verbatim, running `main.ts`
twice yields a byte-identical dossier.
