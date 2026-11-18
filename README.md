# velvet-bay

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/naufalumer/velvet-bay/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/naufalumer/velvet-bay/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

VELVET BAY is a smooth neon-noir 3D open-world crime game: a seeded procedural city at dusk, on foot and behind the wheel. Rae Vega tried to go straight — the city had other plans. Steal cars, drift the boulevard to build a style multiplier, outrun the Velvet Bay PD through 5 wanted stars, run the package, and pull the Velvet Job across a 5-mission story chain. Free roam after the story, with your best cash saved locally.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — the game runs fully offline in a desktop browser, no build step, no network. three.js is vendored under `game/vendor/`.

## Controls

WASD move & drive · Shift sprint · Space jump / handbrake drift · E enter & steal cars · F punch · Click to shoot · R reload · F3 perf overlay · Esc pause

## Why it is smooth

The city renders through InstancedMeshes (road dashes, palms, lamps), the particle system is a fixed zero-allocation pool, car geometry and materials are shared across the whole fleet, and a dynamic-resolution scaler steps the pixel ratio down when frames run long so the game holds 60 fps instead of stuttering. Press F3 in game to see the live FPS, pixel ratio and draw-call count.

## Files

- `game/index.html` + `game/src/*.js` — the game (three.js ES modules, stdlib only besides the vendored three.js)
- `main.ts` — the entry program: copies `game/` and `screenshots/` into the output directory and writes `dossier.json`
- `serve.ts` — tiny static server for local play
- `shots.json` + `screenshots/` — the 4 staged screenshots the dossier carries

---

<sub>Entered on [make.fun](https://make.fun/?ref=bye4mn13&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
