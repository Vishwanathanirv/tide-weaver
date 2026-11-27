# Security

## Report a vulnerability

Use **Report a vulnerability** on the repository's Security tab (GitHub private reporting). Please do not open a public issue for a security problem.

## Scope

The game in `src/`, the Cloudflare Worker in `worker/`, and the build and hosting configuration. Only the latest commit on `main` is supported.

## Threat model

| Asset | Who might attack it | How | Defence |
| --- | --- | --- | --- |
| The player's browser | A hostile shared link | A crafted ghost or save code that crashes or corrupts the game | `decode` in `src/ghost.ts` accepts only a strict alphabet, a fixed version byte, bounded lengths and levels, and rejects trailing bytes; `sanitize` in `src/save.ts` rebuilds every save field from known types and ranges |
| The player's progress | The player or a script | Editing localStorage to add gems | Not defended. The save checksum detects corruption, not tampering. Nothing is competitive or paid, so a cheat only changes that player's own game |
| The page | A third-party script or injected markup | XSS, clickjacking, data leaks | Content Security Policy allows only same-origin scripts and connections; the game adds no outside scripts; it never renders player text as HTML |
| Player privacy | The game's own analytics | Tracking | Off unless the build has a key; anonymous random device id, no cookies, no person profiles; the Worker does not forward the IP address or cookies; a switch in Settings turns it off |
| The stats proxy | Anyone on the internet | Using `/ingest` as an open relay | The Worker forwards only `POST` and `OPTIONS` under `/ingest/` to one fixed host |

## What this does not protect against

- A player cheating in their own game. There are no leaderboards or purchases to protect.
- Someone with local access to the player's device.
- Fake analytics events sent directly to the stats project. Treat the numbers as indicative.
- A compromised Cloudflare or GitHub account.

## Known limits

- Ghost links replay a run from recorded input. The code is validated, but a replay that does not match the physics simply ends early; it is never trusted for scores.
- The portal adapter in `src/ads.ts` calls whatever SDK the embedding portal provides. It adds no ad code of its own.

## Dependencies

Runtime dependencies: none. Build tools only (TypeScript, Vite, Vitest). GitHub Dependabot alerts are on and none are open.
