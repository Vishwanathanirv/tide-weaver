# Tide-Weaver

Free browser game by coralctrl. Vanilla TypeScript + Vite, Canvas 2D, Web Audio. No runtime dependencies and no asset files.

## Commands
- `npm run dev` · `npm test` · `npm run build` (runs `tsc --noEmit` first)

## Layout
- `src/physics.ts` fixed-step spirit physics (60 Hz, 2 sub-steps), landing grades, rings
- `src/rules.ts` light, flow tiers, multiplier, kilometres, run end and its cause
- `src/terrain.ts` analytic seeded hills, biomes, per-chunk rings, gems, jets, trick rings, collapsing crests, spikes and gates (all seeded, timed by physics frame)
- `src/render.ts` five skies blended by weight, particle pool, trail, camera
- `src/audio.ts` procedural score: pad, rain, wind, four instruments, quantised notes; owns the AudioContext and the 88 BPM grid
- `src/lofi.ts` lo-fi loop on the shared grid: keys and crackle always, hats at ×1.5, bass and snare at ×3.0 (LOCKED IN), water skim, bass meter
- `src/surfer.ts` silhouette rider, energy board, 10-segment Verlet scarf (visual only)
- `src/world.ts` drawing for gems, jets, caustics, spikes and tide gates
- `src/juice.ts` hit-stop clock and callouts (clean, inches, skill issue); never changes physics results
- `vite.config.ts` also emits `dist/sw.js`: offline precache of exactly the built files, cache name hashed from the list
- `src/save.ts` dual-slot checksummed save vault, save codes
- `src/main.ts` loop, input, UI panels, daily wave, auras, sharing
- `tests/` physics determinism, run rules, juice, terrain, saves, music

## Rules
- Keep the game loop allocation-free: reuse event objects, pools and typed arrays.
- Physics must stay deterministic for a seed and input sequence. The test enforces it. Hit-stop and other juice delay real time only; telemetry fields on StepEvents are read-only.
- Journey and daily runs end only when the light fades, and the summary always says why. Zen never ends.
- No external requests at runtime. The CSP in `vercel.json` allows `'self'` only.
- The secret aura is awarded only by the observatory reveal (`revealObservatory` in `main.ts`); keep it out of the auras and milestones lists until found.
- Game balance numbers live at the top of `physics.ts`. Tune them after playing.
