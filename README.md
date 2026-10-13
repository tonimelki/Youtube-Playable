# Orbit Hop: a YouTube Playable

A one-tap arcade game built for [YouTube Playables](https://developers.google.com/youtube/gaming/playables).

**How to play:** you orbit a planet. Tap (or press Space) to leap off along your orbit, and get caught by the gravity ring of the next planet. Each planet collapses a few seconds after you land, so keep moving. Aim at a planet's center to score a **Perfect** (+2 up to +5 when you chain them). Grab stars for bonus points. Later planets move, and everything speeds up.

- Plain HTML5 Canvas and JavaScript. No engine, no dependencies, no build step.
- The whole bundle is about 12 KB zipped. Sounds are synthesized in code, so there are no asset files.
- Works in portrait (phone) and landscape (desktop), with touch, mouse and keyboard.
- Localized into English, Spanish, French, Portuguese, German, Italian, Arabic (right-to-left) and Japanese.

## Project layout

```
game/                 ← the game bundle (this is what YouTube gets)
  index.html          loads the Playables SDK first, then the game
  style.css
  js/platform.js      wrapper around the YouTube Playables SDK (ytgame)
  js/i18n.js          translations
  js/audio.js         Web Audio sound effects
  js/game.js          gameplay, rendering, input
scripts/package.sh    builds dist/orbit-hop.zip for submission
.github/workflows/pages.yml   publishes game/ to GitHub Pages
```

## Run locally

```bash
npx serve game        # or: python3 -m http.server -d game 8000
```

Then open the printed URL. Outside YouTube, `js/platform.js` falls back to `localStorage` for saves and to the browser's language and tab visibility for the rest. The same files run unchanged inside YouTube.

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
