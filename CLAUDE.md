# Tide-Weaver

Free browser game by coralctrl. Vanilla TypeScript + Vite, Canvas 2D, Web Audio. No runtime dependencies and no asset files.

## Commands
- `npm run dev` · `npm test` · `npm run build` (runs `tsc --noEmit` first)

## Layout
- `src/physics.ts` fixed-step spirit physics (60 Hz, 2 sub-steps), landing grades, rings, Surge (speed burst, ring magnet, cooldown)
- `src/rules.ts` light, flow tiers, multiplier, kilometres, run end and its cause
- `src/terrain.ts` analytic seeded hills, biomes, per-chunk rings, gems, jets, trick rings, collapsing crests, spikes and gates (all seeded, timed by physics frame)
- `src/render.ts` five skies blended by weight, particle pool, trail, camera
- `src/audio.ts` procedural score: pad, rain, wind, four instruments, quantised notes; owns the AudioContext and the 88 BPM grid
- `src/lofi.ts` lo-fi loop on the shared grid: keys and crackle always, hats at ×1.5, bass and snare at ×3.0 (LOCKED IN), water skim, bass meter
- `src/surfer.ts` silhouette rider, energy board, 10-segment Verlet scarf (visual only)
- `src/world.ts` drawing for gems, jets, caustics, spikes and tide gates
- `src/juice.ts` hit-stop clock and callouts (clean, inches, skill issue); never changes physics results
- `vite.config.ts` also emits `dist/sw.js`: offline precache of exactly the built files, cache name hashed from the list
- `src/ghost.ts` input log, link codec and `Replay` (a second spirit on its own Terrain); `src/quests.ts` goal pool and rules; `src/gear.ts` boards and scarves; `src/clip.ts` staggered MediaRecorders for 9:16 clips
- `src/save.ts` dual-slot checksummed save vault, save codes
- `src/main.ts` loop, input, UI panels, daily wave, auras, sharing
- `src/rival.ts` wandering rival and the title autopilot (own Terrain, never touches the player); `gear.ts` also holds the gem upgrade curves (Vessel feeds `rules.ts`; Magnet and Core feed `makeSpirit` and are stored in ghost links)
- `tests/` physics determinism, run rules, juice, terrain, saves, music

## Rules
- Keep the game loop allocation-free: reuse event objects, pools and typed arrays.
- Physics must stay deterministic for a seed and input sequence. The test enforces it. Hit-stop and other juice delay real time only; telemetry fields on StepEvents are read-only.
- Journey and daily runs end only when the light fades, and the summary always says why. Zen never ends.
- No external requests at runtime. The CSP in `vercel.json` allows `'self'` only.
- The secret aura is awarded only by the observatory reveal (`revealObservatory` in `main.ts`); keep it out of the auras and milestones lists until found.
- Camera feel (zoom, look-ahead, roll, shots) lives in `Renderer.draw`; roll is clamped to 0.08 rad and the world is scaled so corners never show. Roll is off in calm motion. The banner is drawn outside the roll.
- Ghosts depend on determinism: anything that changes a run's physics (new input, new per-step state) must be recorded in `Recorder` and replayed in `Replay`, and covered in `tests/ghost.test.ts`. Runs started during the first-run tips are not shareable as ghosts.
- Board stats (`gear.ts`) feed physics through `makeSpirit(terrain, dive, flip)`; scarves are visual only.
- Landmark positions come from `landmarkX/landmarkKind` (the gate is exactly on every 5th km). Add new kinds to `KINDS` and `silhouette`.
- The title is part of the render: `FrameState.title`/`intro` drive the camera pan and swoop and `titleLayer`. It shows once, until the first press; the HUD hides via `body.titling`.
- The tidal wave (`tide.ts`) depends only on the physics step count and never touches physics; a run it ends is still a valid ghost. It is off in Zen and while `hazardsOn()` is false.
- Lagoons: `lagoonAt(x)` (terrain.ts) is the last 2 km of each km; keep hazard generation behind `!lagoon`.
- Dev-only URL params (stripped from production): `km`, `streak`, `obs`, `notips`, `tgap`; `window.__tw` for browser tests.
- Set-pieces that touch physics are seeded terrain content (rails, shrine chains, whirlpools, thunderheads, the Leviathan's back and rune ring in `terrain.ts`) or pure functions of world x (`events.ts`: storm front, eclipse gravity, lagoon fog). They live on their own random stream (`er` in `chunk()`), so adding one never shifts existing rings, gems or traps. State they need (rail, whirl, bless, shrine chain) is on `Spirit` and replays exactly in `Replay`.
- Local tooling note: native bundler binaries may be blocked by Application Control on some machines. Tests also run under plain Node with a vitest shim, and `tsc` output can be served by a tiny static server; CI is the source of truth for `npm test` and `npm run build`.
- Game balance numbers live at the top of `physics.ts`. Tune them after playing.

- Opening: `Terrain.opening` is fixed content for chunks 0 and 1 (no random draws). Meteor ramps (`Collapse.up`), shards and caverns use their own stream; meteors are timed by physics frame like collapses.
- Coyote window: `Spirit.coyote` is physics state, so it replays in ghosts; ghost VERSION is 5.
- The title autopilot is a `Rival` riding the real wave for the title view only; a veil dip hides the cut when it loops and when play begins.
- `src/harmony.ts` is the five-stem Lydian bed; it shares the Score's context, grid and buses, and `Score.onSparkle` ducks it. `stemLevels` and `cutoffFor` are pure and tested.
- The opening profile (`Terrain.kick`: valley, climb, lip at 1550, drop) is part of `baseHeight`, so every wave has it. The rail is placed against `gb()` and `tests/opening.test.ts` plays a bot through it. Ghost VERSION is 8.
- Dev-only `window.__tw.meter()` returns peak and RMS of the whole mix (measured: median about -27 dBFS RMS, peaks under -3 dBFS). Sky-rails sit 300 to 520 units over the water, rising with distance. Simulated tuning: a plain dive bot escapes the tidal wave on about 4 in 5 attempts that reach it.
- `src/telemetry.ts` (PostHog capture, off without `VITE_POSTHOG_KEY`, no cookies or profiles, `playStats` save switch) and `src/ads.ts` (Poki and CrazyGames adapter, inert elsewhere). The ? how-to panel is `src/howto.ts`. Games are exempt from the apps-only ban on intro modals, so keep it small and optional.
- Smoothness: JS costs about 2.5 ms a frame; lag is pixel fill. `src/governor.ts` starts the canvas within a 2.3 Mpx budget and steps the resolution down (to 0.55) when frames average over 18.6 ms, climbing back at most 3 times a session. Measured on a software renderer at 1280x720: 20 ms average frames at full size, 16.7 ms at 0.61. Dev `__tw.scale()` and `__tw.force(s)` read and set it.
- Stats path: `telemetry.ts` posts to same-origin `/ingest/capture/`; `worker/index.ts` forwards it to PostHog without IP or cookies (`run_worker_first` only for `/ingest/*`, so assets never invoke the Worker). Do not reintroduce a third-party analytics host in the browser.
- The user PostHog project is on the US cloud (the key is rejected by eu.i.posthog.com); the capture endpoint answers Ok for any key, so check a key against /decide/ before trusting a region.
