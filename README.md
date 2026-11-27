# Tide-Weaver

Surf endless twilight waves as a paper-winged light spirit. Hold to dive down the slopes, let go to fly off the crests. Every dive, ring and apex plays a note, so every run composes its own song.

A coralctrl game. Free, in the browser, no sign-up.

## Play

- **Hold** (Space, click or touch) to dive. Let go to fly.
- **Perfect dive:** land along a downslope. It keeps your streak and speeds you up.
- **Rings** give a burst of speed and a bell note.
- There is no game over. A clumsy landing costs speed, nothing else.

| Key | Action |
| --- | --- |
| Space, click, touch | Dive |
| P or Esc | Pause |
| M | Sound |
| R | Hide the interface (for clean recordings) |

## What changes as you play

- **Four art styles, one per minute.** The world drifts from watercolour twilight to neon midnight, paper-cut dawn and ink-wash rain, and crossfades between them.
- **Four shores, four instruments.** Harp Shallows, Glass Reef, Reed Marsh and Deep Strings each play the melody on a different synthesised instrument.
- **Six auras** unlock through play: Ember, Tide, Moth, Comet, Lotus and Prism.
- **Today's wave.** A 2½-minute run on the same wave for everyone until midnight UTC, with a shareable result card.
- **Seeds.** Every endless wave has a short seed in the URL, so a link replays the same ocean.
- **Postcards.** Save the current frame with your flow and song as an image.

## How it works

- Vanilla TypeScript, Canvas 2D and the Web Audio API. No images, fonts or audio files: everything is drawn and synthesised at runtime.
- **Physics:** fixed 60 Hz step with two sub-steps and render interpolation, identical on 60, 120 and 240 Hz screens. Terrain height and slope are analytic sums of seeded sines.
- **Rendering:** each layer is drawn per art style and blended by weight. Particles live in a fixed struct-of-arrays pool, so nothing is allocated per frame.
- **Audio:** a compressor-limited master bus, a convolution reverb from a generated impulse, a speed-following pad and pentatonic notes quantised to an eighth-note grid.
- **Saves:** two localStorage slots with checksums and schema validation, plus a copyable save code.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # physics, terrain, saves, music
npm run build      # type-check and build to dist/
```

`dist/` is a static site. It deploys as is to Vercel, Cloudflare Pages, itch.io (zip the folder) or a web-game portal.

## Licence

All rights reserved.
