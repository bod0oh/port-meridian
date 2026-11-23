# PORT MERIDIAN — Open World Crime

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/bod0oh/port-meridian/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/bod0oh/port-meridian/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game built for make.fun's **"Make GTA 6"** bounty
([gta6-01](https://make.fun/bounty/gta6-01)). Playable offline in a desktop
browser from its own static files — no build step, no network requests, no
external assets. All art is drawn procedurally on canvas; all sound and music
are synthesized with WebAudio.

## The game

You are **Jax "Reverb" Cole**, a former courier climbing the streets of
**Port Meridian**, a sun-soaked port city. Explore a 120×120-tile open world
on foot and by car, across five districts: Downtown, Old Harbor, Neon Row,
Sunset Beach, and North Hills.

- **Drive & steal cars** — 8 original vehicles, traffic that follows the
  roads, handbrake drifts, damage, smoke, and breakdowns.
- **Wanted level 0–5** — police cars and foot cops chase you, roadblocks at
  4+ stars, and a "Spray & Go" shop to clear your name.
- **6 story missions** — from "First Delivery" to the finale "The Big One",
  plus taxi fares, rampages, 20 hidden packages, and stunt jumps.
- **Combat** — fists, pistol, SMG, and shotgun (buy them at "Ironworks"),
  against the "Rust Vipers" gang and the police.
- **HUD & minimap** — health, armor, money, wanted stars, weapon/ammo,
  in-game clock, mission objective, and a live minimap.
- **Day/night cycle & rain**, procedural synthwave music, and a save system
  (autosave + safehouse saves via localStorage).

## Controls

| Input | Action |
|---|---|
| WASD / Arrows | Move / drive (W gas, S brake, A/D steer) |
| Shift | Run |
| E | Enter/exit car, interact |
| Space | Handbrake (drift) |
| Mouse + click | Aim / shoot or punch |
| R | Reload |
| 1 / 2 / 3 | Switch weapon |
| Esc / P | Pause |
| M | Big map |
| H | Horn |

## Play it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Or open `game/index.html` directly in desktop Chrome.

## Entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/ + out/dossier.json
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with the vendored
`vendor/makefun-game.ts`. It runs twice in the grader and must write
identical bytes.

## Layout

```
├── main.ts            # grader entrypoint
├── LICENSE            # MIT
├── README.md
├── vendor/
│   └── makefun-game.ts   # from the kit, unchanged
├── game/
│   ├── index.html
│   ├── css/style.css
│   └── src/           # one job per file: city, render, entities,
│                      # vehicles, police, combat, missions, economy,
│                      # hud, audio, save, input, shots, main
└── screenshots/       # 4 real renders of the running game
```

## Originality

Every name, character, vehicle, story, artwork, sound, and piece of music in
this game is original and was created for this entry. Nothing is taken from
Rockstar Games or any other commercial game.

## License

MIT — see [LICENSE](LICENSE).
