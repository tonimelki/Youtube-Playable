# Orbit Hop: a YouTube Playable

A one-tap arcade game built for [YouTube Playables](https://developers.google.com/youtube/gaming/playables).

**How to play:** you orbit a planet. Tap (or press Space) to leap off along your orbit, and get caught by the gravity ring of the next planet. Each planet collapses a few seconds after you land, so keep moving. Aim at a planet's center to score a **Perfect** (+2 up to +5 when you chain them). Grab stars for bonus points. Later planets move, and everything speeds up.

### Features

- **Hand-painted look, no image files.** Rocky, gas-giant, ice and lava planets, some with rings, are painted procedurally at load time. Nebula backgrounds change color with each new sector of space.
- **Progression.** Stars collected across runs unlock six comet skins (Comet, Ember, Mint, Nova, Solar, Prism). Every few planets you enter a new sector with its own color palette and a banner.
- **Game feel.** Perfect-landing streaks, shockwaves, screen flash and zoom, slow motion on crash, planets that shake before they collapse, a score that counts up and a "New best" badge.
- **Onboarding.** On a player's first run, an aiming guide shows the launch direction for the first few jumps.
- **Generative soundtrack.** An ambient pad, bass and arpeggio are synthesized live with Web Audio, along with every sound effect. Sound follows YouTube's audio setting, and there is an in-game mute button.
- **Polished UI.** Title screen with a comet picker, pause screen, game-over card with run stats.
- **Anywhere, any input.** Portrait (phone) and landscape (desktop) layouts, with touch, mouse and keyboard (Space to jump, ←/→ to pick a comet, P to pause, M to mute).
- **8 languages.** English, Spanish, French, Portuguese, German, Italian, Arabic (right-to-left) and Japanese.
- **Tiny.** Plain HTML5 Canvas and JavaScript, no engine and no dependencies. The bundle is about 25 KB zipped.

## Project layout

```
game/                 ← the game bundle (this is what YouTube gets)
  index.html          loads the Playables SDK first, then the game
  style.css
  og.jpg              link-preview image for the hosted demo (not in the bundle zip)
  js/platform.js      wrapper around the YouTube Playables SDK (ytgame)
  js/i18n.js          translations
  js/audio.js         Web Audio sound effects + generative music
  js/art.js           procedural planets, glows and nebulae
  js/skins.js         unlockable comets
  js/game.js          gameplay, rendering, UI, input
tests/smoke.mjs       end-to-end test: bot plays the game against a stubbed SDK
scripts/package.sh    builds dist/orbit-hop.zip for submission
.github/workflows/    CI (smoke test) and GitHub Pages deploy
```

## Run locally

```bash
npx serve game        # or: python3 -m http.server -d game 8000
```

Then open the printed URL. Outside YouTube, `js/platform.js` falls back to `localStorage` for saves and to the browser's language and tab visibility for the rest. The same files run unchanged inside YouTube.

## Test

```bash
npm install
npx playwright install chromium   # first time only
npm test
```

The smoke test serves `game/`, then plays it with a bot in headless Chromium at phone, desktop and Arabic settings, using a stubbed `ytgame`. It checks:

- the SDK calls happen in the right order (`firstFrameReady` → `loadData` → `gameReady`), and `saveData` and `sendScore` are called;
- pausing and resuming work;
- there are no page errors.

Screenshots are saved to `tests/output/`. CI runs the same test on every pull request.

## YouTube Playables SDK integration

| Requirement | Where |
| --- | --- |
| SDK `<script src="https://www.youtube.com/game_api/v1">` is the first script | `game/index.html` |
| `ytgame.game.firstFrameReady()` after the first frame is drawn | `game.js` → `frame()` |
| `ytgame.game.gameReady()` once save data + language are loaded | `game.js` → `boot()` |
| Save and load progress with `ytgame.game.saveData` / `loadData` (no cookies or localStorage inside YouTube) | `platform.js`, `game.js` → `persist()` / `restore()` |
| Pause and resume with `ytgame.system.onPause` / `onResume` | `game.js` → `boot()` |
| Follow YouTube's audio setting with `isAudioEnabled` / `onAudioEnabledChange` | `audio.js`, `game.js` → `boot()` |
| Language from `ytgame.system.getLanguage()` | `i18n.js` |
| Report score with `ytgame.engagement.sendScore({ value })` at game over | `game.js` → `die()` |
| Report errors with `ytgame.health.logError()` | `game.js` |
| No network requests, no external links, no ads | whole bundle |

Before submitting, check this table against Google's current [SDK reference](https://developers.google.com/youtube/gaming/playables/reference/sdk) and [certification requirements](https://developers.google.com/youtube/gaming/playables/certification/requirements). Run the game through their test suite too.

## Get a public link for the interest form

The Playables interest form asks for a public link on a hosted website. GitHub Pages works for that:

1. Merge this work into `main`.
2. In the repo on GitHub, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Pushing to `main` (or running the *Deploy game to GitHub Pages* workflow by hand) publishes the game at `https://<your-username>.github.io/<repo-name>/`.

The repository must be public, or on a plan that allows Pages for private repos.

## Package the bundle

```bash
./scripts/package.sh   # → dist/orbit-hop.zip (index.html at the zip root)
```
