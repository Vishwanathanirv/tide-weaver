# Tide-Weaver

Surf endless twilight waves as a paper-winged light spirit. Hold to dive down the slopes, let go to fly off the crests. Every dive, ring and apex plays a note, so every run composes its own song.

A coralctrl game. Free, in the browser, no sign-up.

## Play

- **Press to start.** The spirit glides forward on its own; your only control is when to press.
- **Hold** (Space, click or touch) to dive down a slope and gain speed. Let go at the bottom to fly off the next crest.
- **Perfect dive:** land along a downslope. It builds your streak and speeds you up.
- **Your light** fades as you ride. Perfect dives and rings refill it. When it goes out, the run ends and tells you why.
- **Flow tiers:** ride without a rough landing to climb from Calm to Flowing, Radiant and Transcendent. Each tier raises the multiplier and brightens your trail.

| Key | Action |
| --- | --- |
| Space, click, touch | Dive |
| Space on the summary | Ride again |
| P or Esc | Pause |
| M | Sound |
| R | Hide the interface (for clean recordings) |

## The music grows with you

- Lo-fi keys and vinyl crackle from the first press.
- **×1.5:** swung hi-hats and a soft kick join in.
- **×3.0, LOCKED IN:** a bass drop, cinema bars, and the waves pulse with the bassline.
- Surfing the water makes a soft skim that rises with your speed.
- Callouts react to how you move: **clean** for a dead-centre ring (with a 30 ms freeze) or a razor-sharp landing, **inches** for a near miss, **skill issue** for a belly flop.

## Modes

- **Journey:** keep your light burning as long as you can. A pillar of light marks your best distance.
- **Today's wave:** the same wave for everyone until midnight UTC, with a shareable result.
- **Zen:** no light, no ending. Just the sea and the music.

## What changes as you play

- **Five skies, one per minute:** watercolour twilight, a moonlit sea, aurora, paper-cut dawn and ink-wash rain, crossfading as real changes of paint.
- **A living sea:** ripples on the surface, moon and sun reflections, glowing plankton below, fireflies above and the odd shooting star.
- **Four shores, four instruments:** Harp Shallows, Glass Reef, Reed Marsh and Deep Strings each play your melody differently.
- **Six auras** and **13 milestones** unlock through play.
- **Kilometre markers**, a "past your best" moment, and tips on the first run that move on as you learn.
- **Seeds and postcards:** every wave has a link that replays it, and any moment can be saved as an image.

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
npm test           # physics, run rules, terrain, saves, music
npm run build      # type-check and build to dist/
```

`dist/` is a static site. It deploys as is to Vercel, Cloudflare Pages, itch.io (zip the folder) or a web-game portal.

## Licence

All rights reserved.
