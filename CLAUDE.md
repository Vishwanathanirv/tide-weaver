# Tide-Weaver

Free browser game by coralctrl. Vanilla TypeScript + Vite, Canvas 2D, Web Audio. No runtime dependencies and no asset files.

## Commands
- `npm run dev` · `npm test` · `npm run build` (runs `tsc --noEmit` first)

## Layout
- `src/physics.ts` fixed-step spirit physics (60 Hz, 2 sub-steps), landing grades, rings
- `src/terrain.ts` analytic seeded hills, zones, ring placement
- `src/render.ts` four art styles blended by weight, particle pool, trail, camera
- `src/audio.ts` procedural score: pad, rain, wind, four instruments, quantised notes
- `src/save.ts` dual-slot checksummed save vault, save codes
- `src/main.ts` loop, input, UI panels, daily wave, auras, sharing
- `tests/` physics determinism, terrain, saves, music

## Rules
- Keep the game loop allocation-free: reuse event objects, pools and typed arrays.
- Physics must stay deterministic for a seed and input sequence. The test enforces it.
- No game-over screens. Mistakes cost speed only.
- No external requests at runtime. The CSP in `vercel.json` allows `'self'` only.
- Game balance numbers live at the top of `physics.ts`. Tune them after playing.
