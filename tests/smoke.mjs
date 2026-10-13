// End-to-end smoke test: serves game/, plays it with a bot in headless
// Chromium against a stubbed YouTube Playables SDK, and checks the SDK
// contract plus basic gameplay. Screenshots go to tests/output/.
//
//   npm test
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', 'game');
const out = path.join(here, 'output');
fs.mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

// Fake ytgame that records every call.
function stubSdk({ lang }) {
  const calls = [];
  let saved = '';
  window.__calls = calls;
  window.ytgame = {
    IN_PLAYABLES_ENV: true,
    SDK_VERSION: 'test',
    game: {
      firstFrameReady: () => calls.push('firstFrameReady'),
      gameReady: () => calls.push('gameReady'),
      loadData: async () => (calls.push('loadData'), saved),
      saveData: async (d) => {
        if (typeof d !== 'string') throw new Error('saveData expects a string');
        calls.push('saveData');
        saved = d;
      },
    },
    system: {
      isAudioEnabled: () => true,
      onAudioEnabledChange: () => calls.push('onAudioEnabledChange'),
      onPause: (cb) => (window.__pause = cb),
      onResume: (cb) => (window.__resume = cb),
      getLanguage: async () => lang,
    },
    engagement: {
      sendScore: async (s) => {
        if (!Number.isInteger(s.value)) throw new Error('score must be an integer');
        calls.push(`sendScore:${s.value}`);
      },
    },
    health: { logError: () => calls.push('logError'), logWarning: () => calls.push('logWarning') },
  };
}

// Launches when the aim line passes close to the next planet's centre.
function startBot() {
  window.__bot = setInterval(() => {
    const S = window.__S;
    const pl = S.player;
    if (S.state !== 'playing' || pl.mode !== 'orbit' || S.paused) return;
    const tx = -Math.sin(pl.angle) * pl.dir;
    const ty = Math.cos(pl.angle) * pl.dir;
    const p = S.planets.filter((q) => !q.visited).sort((a, b) => b.y - a.y)[0];
    if (!p) return;
    const dx = p.x - pl.x;
    const dy = p.y - pl.y;
    if (dx * tx + dy * ty > 0 && Math.abs(dx * ty - dy * tx) < p.r * 0.6) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    }
  }, 8);
}

const browser = await chromium.launch();
let failures = 0;

async function scenario(name, { viewport, lang = 'en-US', stub = true, playMs = 8000 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.route('https://www.youtube.com/**', (r) => r.abort());
  // Expose the game state to the test without shipping a debug hook.
  await page.route('**/js/game.js', (r) => {
    const src = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
    r.fulfill({ contentType: 'text/javascript', body: src.replace('  resize();\n  reset();', '  window.__S = S;\n  resize();\n  reset();') });
  });
  if (stub) {
    await page.addInitScript(stubSdk, { lang });
    // The real SDK <script> would overwrite the stub; keep ours.
    await page.addInitScript(() => {
      const yt = window.ytgame;
      Object.defineProperty(window, 'ytgame', { get: () => yt, set: () => {} });
    });
  }

  try {
    await page.goto(base);
    await page.waitForFunction(() => window.__S && window.__S.state === 'title');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${name}-1-title.png` });

    const fps = await page.evaluate(() => new Promise((done) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => (performance.now() - t0 < 1000 ? (n++, requestAnimationFrame(tick)) : done(n));
      requestAnimationFrame(tick);
    }));
    console.log(`     ${name}: ${fps} fps (headless, software rendering)`);

    await page.keyboard.press('Space');
    await page.evaluate(startBot);
    await page.waitForTimeout(playMs / 2);
    await page.screenshot({ path: `${out}/${name}-2-play.png` });
    await page.waitForTimeout(playMs / 2);
    const mid = await page.evaluate(() => ({ score: window.__S.score, state: window.__S.state }));
    assert.ok(mid.score > 0, `${name}: bot should score (got ${mid.score})`);

    if (stub) {
      await page.evaluate(() => window.__pause());
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${name}-3-paused.png` });
      assert.equal(await page.evaluate(() => window.__S.paused), true, 'onPause should pause');
      await page.evaluate(() => window.__resume());
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
    }

    await page.evaluate(() => clearInterval(window.__bot));
    await page.waitForFunction(() => window.__S.state === 'over', null, { timeout: 15000 });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${out}/${name}-4-over.png` });

    const end = await page.evaluate(() => ({ score: window.__S.score, best: window.__S.best, calls: window.__calls }));
    assert.equal(end.best, end.score);
    if (stub) {
      const c = end.calls;
      assert.deepEqual(c.slice(0, 2), ['firstFrameReady', 'loadData'], 'firstFrameReady must come first');
      assert.ok(c.indexOf('gameReady') > c.indexOf('loadData'), 'gameReady after loadData');
      assert.ok(c.includes('saveData'), 'progress saved');
      assert.ok(c.includes(`sendScore:${end.score}`), 'score sent');
      assert.ok(!c.includes('logError'), 'no errors logged');
    }
    assert.deepEqual(errors, [], `${name}: page errors`);
    console.log(`ok   ${name}: score ${end.score}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${name}: ${err.message}`);
    await page.screenshot({ path: `${out}/${name}-failure.png` }).catch(() => {});
  } finally {
    await page.close();
  }
}

await scenario('phone', { viewport: { width: 390, height: 844 }, playMs: 12000 });
await scenario('desktop', { viewport: { width: 1280, height: 720 } });
await scenario('arabic', { viewport: { width: 390, height: 844 }, lang: 'ar-LB' });
await scenario('web-fallback', { viewport: { width: 768, height: 1024 }, stub: false });

await browser.close();
server.close();
process.exit(failures ? 1 : 0);
