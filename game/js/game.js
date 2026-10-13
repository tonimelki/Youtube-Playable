// Orbit Hop: tap to leap off your orbit and get captured by the next planet.
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const t = (key, vars) => I18N.t(key, vars);
  const { hsl } = Art;

  // The game is designed on a 420x720 playfield that is always fully visible;
  // extra screen space on any side just shows more of the background.
  const FIELD_W = 420;
  const FIELD_H = 720;
  const LAUNCH_SPEED = 600;
  const MAX_FLIGHT = 1.6;
  const ORBIT_GAP = 16;
  const STAR_RADIUS = 20;
  const SECTOR_LEN = 3000;
  const TAU = Math.PI * 2;
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", "Noto Sans JP", sans-serif';

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const smooth = (a, b, x) => {
    const k = clamp((x - a) / (b - a), 0, 1);
    return k * k * (3 - 2 * k);
  };

  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }
  const mixRgb = (a, b, k) => `rgb(${lerp(a[0], b[0], k) | 0}, ${lerp(a[1], b[1], k) | 0}, ${lerp(a[2], b[2], k) | 0})`;

  // Each sector of space has its own colour palette.
  const SECTORS = [
    { top: [238, 60, 9], bottom: [262, 55, 21], neb: [230, 270, 200] },
    { top: [290, 55, 9], bottom: [330, 60, 20], neb: [300, 330, 260] },
    { top: [200, 70, 8], bottom: [178, 60, 17], neb: [170, 200, 140] },
    { top: [350, 55, 8], bottom: [12, 55, 18], neb: [10, 340, 30] },
    { top: [255, 55, 8], bottom: [32, 45, 18], neb: [40, 270, 20] },
    { top: [160, 55, 7], bottom: [200, 55, 17], neb: [140, 180, 100] },
  ].map((s) => ({ ...s, topRgb: hslToRgb(...s.top), bottomRgb: hslToRgb(...s.bottom) }));
  const nebulae = [];
  const nebulaFor = (i) => (nebulae[i] ||= Art.nebula(SECTORS[i].neb, 1000 + i * 7));

  let W = 1;
  let H = 1;
  let dpr = 1;
  let u = 1; // CSS pixels per playfield unit

  const S = {
    state: 'loading', // loading | title | playing | over
    paused: false,
    t: 0,
    planets: [],
    stars: [],
    particles: [],
    popups: [],
    shockwaves: [],
    banners: [],
    meteors: [],
    trail: [],
    buttons: [],
    player: null,
    cur: null,
    camY: 0,
    shake: 0,
    zoom: 1,
    flash: 0,
    flashHue: 0,
    fade: 1,
    slowT: 0,
    overT: 0,
    score: 0,
    scoreBump: 0,
    best: 0,
    games: 0,
    totalStars: 0,
    runStars: 0,
    startStars: 0,
    streak: 0,
    sector: 1,
    newBest: false,
    unlocked: null,
    hint: false,
    guide: 0,
    skin: 0,
    skinView: 0,
    meteorT: 3,
  };

  const bgStars = [];
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 55; i++) {
      bgStars.push({
        x: Math.random(),
        y: Math.random(),
        layer,
        size: 0.6 + layer * 0.5 + Math.random() * 0.6,
        tw: Math.random() * TAU,
      });
    }
  }

  // ---------------------------------------------------------------- layout

  function resize() {
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    // Cap the backing store at ~2.4 MP so large desktop screens stay smooth.
    dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.4e6 / (W * H)));
    dpr = Math.max(dpr, 0.75);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    u = Math.min(W / FIELD_W, H / FIELD_H);
  }

  const halfW = () => W / 2 / u;
  const halfH = () => H / 2 / u;

  // ----------------------------------------------------------------- skins

  const skinUnlocked = (i) => S.totalStars >= Skins[i].cost;

  function skinHue(i = S.skin, offset = 0) {
    const s = Skins[i];
    return s.rainbow ? (S.t * 90 + offset) % 360 : s.hue;
  }

  // ----------------------------------------------------------------- world

  function makePlanet(x, y, r, level, artOpts) {
    const hue = (190 + level * 37) % 360;
    const art = Art.planet(r, hue, (Math.random() * 1e9) | 0, artOpts);
    return {
      x, baseX: x, y, r, level, art,
      hue: art.atmo,
      ring: r + 26,
      visited: false,
      moving: false, amp: 0, speed: 0, phase: 0,
      pulse: 0,
      timer: 0,
      maxTime: 0,
      warned: 0,
      collapsed: false,
    };
  }

  function spawnNext() {
    const prev = S.planets[S.planets.length - 1];
    const level = prev.level + 1;
    const d = clamp(level / 45, 0, 1); // difficulty 0..1
    const r = rand(26, 36) - d * 8;
    const gap = rand(175, 225) + d * 45;
    const moving = level > 6 && Math.random() < 0.2 + d * 0.45;
    const amp = moving ? rand(35, 60 + d * 50) : 0;
    const limit = 165 - amp;

    let x = 0;
    for (let i = 0; i < 12; i++) {
      x = rand(-limit, limit);
      if (Math.abs(x - prev.baseX) > 70) break;
    }

    const p = makePlanet(x, prev.y - gap, r, level);
    if (moving) {
      p.moving = true;
      p.amp = amp;
      p.speed = rand(0.7, 1.1 + d * 0.8);
      p.phase = rand(0, TAU);
    }
    S.planets.push(p);

    if (level > 1 && Math.random() < 0.55) {
      const f = rand(0.35, 0.65);
      S.stars.push({
        x: clamp(lerp(prev.baseX, x, f) + rand(-50, 50), -180, 180),
        y: lerp(prev.y, p.y, f),
        phase: rand(0, TAU),
      });
    }
  }

  function reset() {
    S.planets = [];
    S.stars = [];
    S.particles = [];
    S.popups = [];
    S.shockwaves = [];
    S.banners = [];
    S.trail = [];

    const first = makePlanet(0, 0, 36, 0, { type: 'gas', ring: true });
    first.visited = true;
    S.planets.push(first);
    S.cur = first;
    for (let i = 0; i < 5; i++) spawnNext();

    S.player = {
      x: 0, y: 0, vx: 0, vy: 0,
      angle: Math.PI * 0.75,
      dir: 1,
      orbitR: first.r + ORBIT_GAP,
      mode: 'orbit', // orbit | flight | dead
      flightT: 0,
    };
    S.camY = first.y - FIELD_H * 0.2;
    S.score = 0;
    S.runStars = 0;
    S.streak = 0;
    S.sector = 1;
    S.newBest = false;
    S.unlocked = null;
    S.overT = 0;
    S.shake = 0;
    S.slowT = 0;
  }

  function omega() {
    return 2.3 + Math.min(S.score, 80) * 0.02;
  }

  // Seconds a planet holds together after you land on it.
  function holdTime() {
    return lerp(4, 2.2, clamp(S.score / 60, 0, 1));
  }

  function armTimer(p) {
    p.maxTime = holdTime();
    p.timer = p.maxTime;
    p.warned = 0;
  }

  // --------------------------------------------------------------- effects

  function burst(x, y, hue, n, speed, life = 0.7, kind = 'spark') {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.3, 1) * speed;
      S.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * rand(0.6, 1),
        max: life,
        hue,
        kind,
        size: kind === 'chunk' ? rand(2.5, 6) : rand(1.5, 3.5),
        rot: rand(0, TAU),
        spin: rand(-8, 8),
      });
    }
  }

  function popup(x, y, text, hue) {
    S.popups.push({ x, y, text, hue, life: 1 });
  }

  function banner(text, sub, hue, life = 1.4, big = false) {
    S.banners = S.banners.filter((b) => b.big !== big);
    S.banners.push({ text, sub, hue, life, max: life, big });
  }

  function shockwave(x, y, r0, r1, hue) {
    S.shockwaves.push({ x, y, r0, r1, hue, life: 1 });
  }

  // -------------------------------------------------------------- gameplay

  function startRun() {
    S.state = 'playing';
    S.hint = S.games < 3;
    S.guide = S.games === 0 ? 3 : 0;
    S.startStars = S.totalStars;
    armTimer(S.cur);
    GameAudio.setIntensity(1);
    GameAudio.play('start');
  }

  function launch() {
    const pl = S.player;
    pl.mode = 'flight';
    pl.flightT = 0;
    pl.vx = -Math.sin(pl.angle) * pl.dir * LAUNCH_SPEED;
    pl.vy = Math.cos(pl.angle) * pl.dir * LAUNCH_SPEED;
    burst(pl.x, pl.y, skinHue(), 10, 110, 0.4);
    GameAudio.play('launch');
  }

  function tryCapture() {
    const pl = S.player;
    for (const p of S.planets) {
      if (p.visited) continue;
      const dx = pl.x - p.x;
      const dy = pl.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > p.ring * p.ring) continue;

      // Aiming at the planet's centre (small miss distance) counts as perfect.
      const cross = dx * pl.vy - dy * pl.vx;
      const miss = Math.abs(cross) / LAUNCH_SPEED;
      const perfect = miss < p.r * 0.55;

      p.visited = true;
      p.pulse = 1;
      S.cur = p;
      armTimer(p);
      S.hint = false;
      if (S.guide > 0) S.guide--;
      pl.mode = 'orbit';
      pl.angle = Math.atan2(dy, dx);
      pl.dir = cross >= 0 ? 1 : -1;
      pl.orbitR = Math.sqrt(d2);
      shockwave(p.x, p.y, p.r, p.ring + 40, perfect ? 48 : p.hue);

      if (perfect) {
        S.streak++;
        const pts = 1 + Math.min(S.streak, 4);
        addScore(pts);
        popup(p.x, p.y - p.r - 30, `+${pts}`, 48);
        banner(t('perfect'), S.streak > 1 ? `×${S.streak}` : '', 48);
        burst(pl.x, pl.y, 48, 26, 240);
        S.zoom = 1.06;
        S.flash = 0.18;
        S.flashHue = 48;
        GameAudio.play('perfect', S.streak);
      } else {
        S.streak = 0;
        addScore(1);
        popup(p.x, p.y - p.r - 30, '+1', p.hue);
        burst(pl.x, pl.y, p.hue, 14, 160);
        S.zoom = 1.025;
        GameAudio.play('capture', S.score);
      }

      const sector = Math.floor(-p.y / SECTOR_LEN) + 1;
      if (sector > S.sector) {
        S.sector = sector;
        banner(`${t('sector')} ${sector}`, '', SECTORS[(sector - 1) % SECTORS.length].neb[0], 2.4, true);
        GameAudio.play('sector');
      }
      return true;
    }
    return false;
  }

  function addScore(n) {
    S.score += n;
    S.scoreBump = 1;
  }

  function checkDeath() {
    const pl = S.player;
    const sy = pl.y - S.camY;
    if (
      pl.flightT > MAX_FLIGHT ||
      Math.abs(pl.x) > halfW() + 20 ||
      sy > halfH() + 20 ||
      sy < -halfH() - 20
    ) {
      die();
    }
  }

  function collectStars() {
    const pl = S.player;
    for (let i = S.stars.length - 1; i >= 0; i--) {
      const s = S.stars[i];
      const dx = pl.x - s.x;
      const dy = pl.y - s.y;
      if (dx * dx + dy * dy < STAR_RADIUS * STAR_RADIUS) {
        S.stars.splice(i, 1);
        addScore(1);
        S.runStars++;
        S.totalStars++;
        popup(s.x, s.y - 24, '+1', 48);
        burst(s.x, s.y, 48, 14, 150, 0.5);
        shockwave(s.x, s.y, 6, 40, 48);
        GameAudio.play('star');
      }
    }
  }

  function collapse(p) {
    p.collapsed = true;
    burst(p.x, p.y, p.hue, 26, 220, 0.9);
    burst(p.x, p.y, p.hue, 18, 160, 1.4, 'chunk');
    shockwave(p.x, p.y, p.r, p.r * 4, 15);
    die();
  }

  function die() {
    const pl = S.player;
    const x = clamp(pl.x, -halfW(), halfW());
    const y = clamp(pl.y, S.camY - halfH(), S.camY + halfH());
    pl.mode = 'dead';
    S.state = 'over';
    S.overT = 0;
    S.shake = 12;
    S.slowT = 0.5;
    S.flash = 0.35;
    S.flashHue = 0;
    burst(x, y, skinHue(), 40, 280, 1);
    GameAudio.play('die');
    GameAudio.setIntensity(0);

    S.games++;
    if (S.score > S.best) {
      S.best = S.score;
      S.newBest = true;
    }

    // Comets unlocked by the stars collected this run; equip the best one.
    for (let i = 0; i < Skins.length; i++) {
      if (Skins[i].cost > S.startStars && skinUnlocked(i)) S.unlocked = i;
    }
    if (S.unlocked != null) {
      S.skin = S.skinView = S.unlocked;
      setTimeout(() => GameAudio.play('unlock'), 900);
    }

    persist();
    Platform.sendScore(S.score);
  }

  function persist() {
    Platform.saveData(JSON.stringify({
      v: 1,
      best: S.best,
      games: S.games,
      stars: S.totalStars,
      skin: Skins[S.skin].id,
      muted: GameAudio.userMuted,
    }));
  }

  function restore(raw) {
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
      S.best = num(data.best);
      S.games = num(data.games);
      S.totalStars = num(data.stars);
      const skin = Skins.findIndex((s) => s.id === data.skin);
      if (skin >= 0 && skinUnlocked(skin)) S.skin = S.skinView = skin;
      GameAudio.userMuted = !!data.muted;
    } catch (err) {
      console.warn('Ignoring unreadable save data', err);
    }
  }

  // ----------------------------------------------------------------- input

  function primaryAction() {
    if (S.paused) {
      S.paused = false;
      return;
    }
    if (S.state === 'title') {
      startRun();
    } else if (S.state === 'playing') {
      if (S.player.mode === 'orbit') launch();
    } else if (S.state === 'over' && S.overT > 0.9) {
      reset();
      startRun();
    }
  }

  function cycleSkin(step) {
    S.skinView = (S.skinView + step + Skins.length) % Skins.length;
    if (skinUnlocked(S.skinView)) {
      S.skin = S.skinView;
      persist();
    }
    GameAudio.play('ui');
  }

  function onButton(id) {
    switch (id) {
      case 'mute':
        GameAudio.toggleMute();
        persist();
        break;
      case 'pause':
        S.paused = true;
        break;
      case 'prev':
        cycleSkin(-1);
        break;
      case 'next':
        cycleSkin(1);
        break;
      default:
        primaryAction();
    }
  }

  function handleTap(x, y) {
    if (S.state === 'loading') return;
    for (const b of S.buttons) {
      if (Math.abs(x - b.x) <= b.w / 2 + 6 && Math.abs(y - b.y) <= b.h / 2 + 6) {
        b.pressed = S.t;
        S.pressed = { id: b.id, t: S.t };
        onButton(b.id);
        return;
      }
    }
    primaryAction();
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    GameAudio.unlock();
    handleTap(e.clientX, e.clientY);
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat || S.state === 'loading') return;
    GameAudio.unlock();
    switch (e.code) {
      case 'Space':
      case 'Enter':
      case 'ArrowUp':
        e.preventDefault();
        primaryAction();
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (S.state === 'title') cycleSkin(e.code === 'ArrowLeft' ? -1 : 1);
        break;
      case 'KeyP':
      case 'Escape':
        if (S.state === 'playing') S.paused = !S.paused;
        break;
      case 'KeyM':
        onButton('mute');
        break;
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------- update

  function update(dt) {
    S.t += dt;
    for (const p of S.planets) {
      if (p.moving) p.x = p.baseX + Math.sin(S.t * p.speed + p.phase) * p.amp;
      p.pulse = Math.max(0, p.pulse - dt * 2);
    }

    const pl = S.player;
    if (pl.mode === 'orbit') {
      const p = S.cur;
      pl.angle += pl.dir * omega() * dt;
      pl.orbitR = damp(pl.orbitR, p.r + ORBIT_GAP, 8, dt);
      pl.x = p.x + Math.cos(pl.angle) * pl.orbitR;
      pl.y = p.y + Math.sin(pl.angle) * pl.orbitR;
      if (S.state === 'playing') {
        p.timer -= dt;
        const step = p.timer < 1 ? Math.ceil((1 - p.timer) * 3) : 0;
        if (step > p.warned) {
          p.warned = step;
          GameAudio.play('warn');
        }
        if (p.timer <= 0) collapse(p);
      }
    } else if (pl.mode === 'flight') {
      pl.x += pl.vx * dt;
      pl.y += pl.vy * dt;
      pl.flightT += dt;
      if (!tryCapture()) checkDeath();
    }

    if (S.state === 'playing') collectStars();

    if (pl.mode !== 'dead') {
      S.trail.push({ x: pl.x, y: pl.y });
      if (S.trail.length > 26) S.trail.shift();
    } else if (S.trail.length) {
      S.trail.shift();
    }

    S.camY = damp(S.camY, S.cur.y - FIELD_H * 0.2, 3.5, dt);

    while (S.planets[S.planets.length - 1].y > S.camY - halfH() - 400) spawnNext();
    const cutoff = S.camY + halfH() + 250;
    S.planets = S.planets.filter((p) => p === S.cur || p.y < cutoff);
    S.stars = S.stars.filter((s) => s.y < cutoff);

    for (const q of S.particles) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 1 - 2.5 * dt;
      q.vy *= 1 - 2.5 * dt;
      q.rot += q.spin * dt;
      q.life -= dt;
    }
    S.particles = S.particles.filter((q) => q.life > 0);

    for (const p of S.popups) {
      p.y -= 40 * dt;
      p.life -= dt * 0.9;
    }
    S.popups = S.popups.filter((p) => p.life > 0);

    for (const w of S.shockwaves) w.life -= dt * 2.2;
    S.shockwaves = S.shockwaves.filter((w) => w.life > 0);

    for (const b of S.banners) b.life -= dt;
    S.banners = S.banners.filter((b) => b.life > 0);

    S.meteorT -= dt;
    if (S.meteorT <= 0) {
      S.meteorT = rand(3, 7);
      const dir = Math.random() < 0.5 ? -1 : 1;
      S.meteors.push({ x: rand(0.2, 0.8), y: rand(0.05, 0.45), vx: dir * rand(0.5, 0.8), vy: rand(0.2, 0.35), life: 1 });
    }
    for (const m of S.meteors) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt * 1.2;
    }
    S.meteors = S.meteors.filter((m) => m.life > 0);

    S.shake = Math.max(0, S.shake - dt * 30);
    S.zoom = damp(S.zoom, 1, 6, dt);
    S.scoreBump = Math.max(0, S.scoreBump - dt * 4);
  }

  // ------------------------------------------------------------ draw utils

  function text(str, x, y, size, color, weight = 700, alpha = 1, shadow = false) {
    ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Pure numbers ("+3", "×2") always read left to right.
    ctx.direction = I18N.rtl && /[^\d\s+×-]/.test(str) ? 'rtl' : 'ltr';
    ctx.globalAlpha = alpha;
    if (shadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = size * 0.35;
      ctx.shadowOffsetY = size * 0.06;
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 1;
  }

  function measure(str, size, weight = 700) {
    ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
    return ctx.measureText(str).width;
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function starPath(x, y, outer, inner, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? inner : outer;
      const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function glowAt(x, y, r, hue, alpha = 1, sat = 100, light = 65) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(Art.glow(hue, sat, light), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Registers a tappable button for this frame and draws it.
  function button(id, x, y, w, h, draw) {
    const b = { id, x, y, w, h };
    S.buttons.push(b);
    const pressed = S.pressed && S.pressed.id === id && S.t - S.pressed.t < 0.12;
    ctx.save();
    ctx.translate(x, y);
    if (pressed) ctx.scale(0.92, 0.92);
    draw(w, h);
    ctx.restore();
  }

  function pillButton(id, x, y, w, h, label, hue, pulse = 0) {
    button(id, x, y, w * (1 + pulse * 0.03), h * (1 + pulse * 0.03), (bw, bh) => {
      glowAt(0, 0, bw * 0.6, hue, 0.25 + pulse * 0.15);
      const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
      g.addColorStop(0, hsl(hue, 95, 66));
      g.addColorStop(1, hsl(hue + 25, 85, 50));
      ctx.fillStyle = g;
      roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = Math.max(1, u);
      roundRect(-bw / 2 + 1, -bh / 2 + 1, bw - 2, bh - 2, bh / 2);
      ctx.stroke();
      text(label, 0, 1, bh * 0.42, '#fff', 800, 1, true);
    });
  }

  function iconButton(id, x, y, r, drawIcon) {
    button(id, x, y, r * 2, r * 2, () => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = Math.max(1, u);
      ctx.stroke();
      ctx.scale(r / 18, r / 18);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#fff';
      drawIcon();
    });
  }

  // --------------------------------------------------------------- drawing

  function drawBackground() {
    const f = Math.max(0, -S.camY) / SECTOR_LEN;
    const i0 = Math.floor(f);
    const k = smooth(0.75, 1, f - i0);
    const A = SECTORS[i0 % SECTORS.length];
    const B = SECTORS[(i0 + 1) % SECTORS.length];

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mixRgb(A.topRgb, B.topRgb, k));
    g.addColorStop(1, mixRgb(A.bottomRgb, B.bottomRgb, k));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Nebula clouds, cross-fading between sectors.
    const tileW = Math.max(W, 420 * u);
    const tileH = tileW * 2;
    let oy = (-S.camY * u * 0.18) % tileH;
    if (oy < 0) oy += tileH;
    ctx.globalCompositeOperation = 'lighter';
    for (const [idx, a] of [[i0 % SECTORS.length, 1 - k], [(i0 + 1) % SECTORS.length, k]]) {
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      const img = nebulaFor(idx);
      for (let y = oy - tileH; y < H; y += tileH) ctx.drawImage(img, (W - tileW) / 2, y, tileW, tileH);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    for (const s of bgStars) {
      const pf = 0.05 + s.layer * 0.12;
      let y = (s.y * H - S.camY * u * pf) % H;
      if (y < 0) y += H;
      const a = clamp(0.35 + 0.35 * Math.sin(S.t * 2 + s.tw) + s.layer * 0.1, 0.1, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x * W, y, s.size, s.size);
      if (s.layer === 2) glowAt(s.x * W + 1, y + 1, 5, 220, a * 0.5, 60, 80);
    }
    ctx.globalAlpha = 1;

    ctx.lineCap = 'round';
    for (const m of S.meteors) {
      const x = m.x * W;
      const y = m.y * H;
      const len = 90;
      const n = Math.hypot(m.vx, m.vy);
      const tg = ctx.createLinearGradient(x, y, x - (m.vx / n) * len, y - (m.vy / n) * len);
      tg.addColorStop(0, `rgba(255, 255, 255, ${0.8 * m.life})`);
      tg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.strokeStyle = tg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (m.vx / n) * len, y - (m.vy / n) * len);
      ctx.stroke();
    }
  }

  function drawPlanetRing(p, x, y, front) {
    const a = p.art;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a.ringTilt);
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 1.85, p.r * 0.5, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
    ctx.strokeStyle = hsl(a.ringHue, 55, 72, 0.6);
    ctx.lineWidth = p.r * 0.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 2.12, p.r * 0.58, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
    ctx.strokeStyle = hsl(a.ringHue, 55, 85, 0.3);
    ctx.lineWidth = p.r * 0.06;
    ctx.stroke();
    ctx.restore();
  }

  function drawPlanet(p) {
    const dim = p.visited && p !== S.cur;
    let x = p.x;
    let y = p.y;
    let danger = 0;
    if (p === S.cur && S.state === 'playing' && p.timer < 1.2) {
      danger = 1 - p.timer / 1.2;
      x += rand(-1, 1) * danger * 2.5;
      y += rand(-1, 1) * danger * 2.5;
    }

    if (p.moving) {
      ctx.strokeStyle = hsl(p.hue, 80, 70, 0.12);
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(p.baseX - p.amp, p.y);
      ctx.lineTo(p.baseX + p.amp, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (!p.visited) {
      ctx.setLineDash([3, 9]);
      ctx.lineDashOffset = -S.t * 14;
      ctx.lineWidth = 2;
      ctx.strokeStyle = hsl(p.hue, 90, 78, 0.45);
      ctx.beginPath();
      ctx.arc(x, y, p.ring, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    glowAt(x, y, p.r * 2.4 + p.pulse * 30, danger > 0 ? 8 : p.hue, (dim ? 0.12 : 0.32) + p.pulse * 0.4 + danger * 0.3);

    ctx.globalAlpha = dim ? 0.45 : 1;
    if (p.art.hasRing) drawPlanetRing(p, x, y, false);
    const s = p.art.size;
    ctx.drawImage(p.art.img, x - s / 2, y - s / 2, s, s);
    if (danger > 0) {
      ctx.fillStyle = `rgba(255, 70, 40, ${danger * 0.35 * (0.7 + 0.3 * Math.sin(S.t * 30))})`;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, TAU);
      ctx.fill();
    }
    if (p.art.hasRing) drawPlanetRing(p, x, y, true);
    ctx.globalAlpha = 1;
  }

  // Countdown ring around the planet you're standing on.
  function drawTimer(p) {
    const k = clamp(p.timer / p.maxTime, 0, 1);
    const r = p.r + ORBIT_GAP + 13;
    const hue = lerp(0, 160, smooth(0.15, 0.6, k));
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = hsl(hue, 90, 65, p.timer < 1 ? 0.6 + 0.4 * Math.sin(S.t * 20) : 0.85);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
  }

  function drawStar(s) {
    const y = s.y + Math.sin(S.t * 3 + s.phase) * 4;
    glowAt(s.x, y, 26 + Math.sin(S.t * 5 + s.phase) * 3, 46, 0.55);
    ctx.fillStyle = hsl(48, 100, 64);
    starPath(s.x, y, 10, 4.5, Math.sin(S.t * 2 + s.phase) * 0.4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    starPath(s.x - 1, y - 1.5, 4.5, 2, Math.sin(S.t * 2 + s.phase) * 0.4);
    ctx.fill();
  }

  function drawComet(x, y, hue, scale = 1) {
    glowAt(x, y, 28 * scale, hue, 0.9);
    glowAt(x, y, 12 * scale, hue, 0.8, 100, 85);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 5.5 * scale, 0, TAU);
    ctx.fill();
  }

  function drawPlayer() {
    const pl = S.player;
    const n = S.trail.length;
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < n; i++) {
      const a = S.trail[i - 1];
      const b = S.trail[i];
      const k = i / n;
      ctx.strokeStyle = hsl(skinHue(S.skin, (n - i) * 9), 100, 62, k * 0.55);
      ctx.lineWidth = lerp(1, 11, k * k);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (pl.mode === 'dead') return;

    // First-run aiming guide along the launch direction.
    if (S.guide > 0 && S.state === 'playing' && pl.mode === 'orbit' && !S.paused) {
      const tx = -Math.sin(pl.angle) * pl.dir;
      const ty = Math.cos(pl.angle) * pl.dir;
      ctx.setLineDash([2, 10]);
      ctx.lineDashOffset = -S.t * 40;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.moveTo(pl.x, pl.y);
      ctx.lineTo(pl.x + tx * 160, pl.y + ty * 160);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawComet(pl.x, pl.y, skinHue());
  }

  function drawWorld() {
    const sx = S.shake ? rand(-1, 1) * S.shake : 0;
    const sy = S.shake ? rand(-1, 1) * S.shake : 0;
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(u * S.zoom, u * S.zoom);
    ctx.translate(0, -S.camY);

    for (const p of S.planets) if (!p.collapsed) drawPlanet(p);
    if (S.state === 'playing' && !S.cur.collapsed) drawTimer(S.cur);
    for (const s of S.stars) drawStar(s);

    for (const w of S.shockwaves) {
      const k = 1 - w.life;
      ctx.strokeStyle = hsl(w.hue, 100, 75, w.life * 0.7);
      ctx.lineWidth = 1 + w.life * 4;
      ctx.beginPath();
      ctx.arc(w.x, w.y, lerp(w.r0, w.r1, ease(k)), 0, TAU);
      ctx.stroke();
    }

    drawPlayer();

    for (const q of S.particles) {
      const a = clamp(q.life / q.max, 0, 1);
      if (q.kind === 'chunk') {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = hsl(q.hue, 50, 40, a);
        ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7);
        ctx.restore();
      } else {
        glowAt(q.x, q.y, q.size * 3, q.hue, a);
      }
    }
    for (const p of S.popups) {
      text(p.text, p.x, p.y, 22, hsl(p.hue, 100, 78), 900, clamp(p.life * 1.5, 0, 1), true);
    }
    ctx.restore();
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(5, 4, 20, ${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawMuteIcon() {
    const on = GameAudio.enabled;
    ctx.translate(-3, 0);
    ctx.beginPath();
    ctx.moveTo(-8, -4);
    ctx.lineTo(-3, -4);
    ctx.lineTo(3, -9);
    ctx.lineTo(3, 9);
    ctx.lineTo(-3, 4);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (on) {
      ctx.arc(4, 0, 5, -0.9, 0.9);
      ctx.moveTo(7.5, -7);
      ctx.arc(4, 0, 9, -0.9, 0.9);
    } else {
      ctx.moveTo(7, -5);
      ctx.lineTo(15, 5);
      ctx.moveTo(15, -5);
      ctx.lineTo(7, 5);
    }
    ctx.stroke();
  }

  function drawPauseIcon() {
    roundRect(-6, -7, 4, 14, 1.5);
    ctx.fill();
    roundRect(2, -7, 4, 14, 1.5);
    ctx.fill();
  }

  function drawArrowIcon(dir) {
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-3 * dir, -7);
    ctx.lineTo(4 * dir, 0);
    ctx.lineTo(-3 * dir, 7);
    ctx.stroke();
  }

  function drawStarCount(x, y, size, count, alpha = 1) {
    const label = String(count);
    const w = measure(label, size, 800);
    const total = size * 1.1 + w;
    const sx = x - total / 2 + size * 0.45;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hsl(48, 100, 64);
    starPath(sx, y, size * 0.5, size * 0.22, 0);
    ctx.fill();
    ctx.globalAlpha = 1;
    text(label, sx + size * 0.65 + w / 2, y + 1, size, '#fff', 800, alpha);
  }

  function chip(x, y, h, draw, w) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
    roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = Math.max(1, u * 0.8);
    ctx.stroke();
    draw();
  }

  function drawLogo(cx, y) {
    const size = 60 * u;
    const bob = Math.sin(S.t * 1.6) * 3 * u;
    ctx.font = `900 ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    const w = ctx.measureText('ORBIT HOP').width;
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, hsl(190, 100, 70));
    g.addColorStop(0.5, hsl(265, 100, 80));
    g.addColorStop(1, hsl(320, 100, 72));
    ctx.shadowColor = hsl(265, 100, 60, 0.8);
    ctx.shadowBlur = 24 * u;
    ctx.fillStyle = g;
    ctx.fillText('ORBIT HOP', cx, y + bob);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Little comet circling the logo.
    const a = S.t * 1.4;
    const ox = cx + Math.cos(a) * (w / 2 + 14 * u);
    const oy = y + bob + Math.sin(a) * size * 0.55;
    if (Math.sin(a) > -0.2) {
      ctx.save();
      ctx.scale(u, u);
      drawComet(ox / u, oy / u, skinHue(), 0.6);
      ctx.restore();
    }
  }

  function drawTitle(cx, cy) {
    dim(0.3);
    drawLogo(cx, cy - 238 * u);
    text(t('how_to'), cx, cy - 190 * u, 17 * u, hsl(200, 100, 85), 600, 0.9, true);

    const chipH = 30 * u;
    const bestLabel = `${t('best')} ${S.best}`;
    const bw = measure(bestLabel, 15 * u, 800) + 30 * u;
    const sw = measure(String(S.totalStars), 15 * u, 800) + 46 * u;
    const gap = 10 * u;
    const left = cx - (bw + sw + gap) / 2;
    chip(left + bw / 2, cy - 148 * u, chipH, () => text(bestLabel, left + bw / 2, cy - 147 * u, 15 * u, hsl(48, 100, 75), 800), bw);
    chip(left + bw + gap + sw / 2, cy - 148 * u, chipH, () => drawStarCount(left + bw + gap + sw / 2, cy - 148 * u, 15 * u, S.totalStars), sw);

    // Comet picker around the home planet.
    const py = cy + (S.cur.y - S.camY) * u;
    iconButton('prev', cx - 125 * u, py, 20 * u, () => drawArrowIcon(-1));
    iconButton('next', cx + 125 * u, py, 20 * u, () => drawArrowIcon(1));
    const skin = Skins[S.skinView];
    const locked = !skinUnlocked(S.skinView);
    text(skin.name.toUpperCase(), cx, cy + 222 * u, 16 * u, locked ? 'rgba(255,255,255,0.55)' : '#fff', 800, 1, true);
    if (locked) {
      text(t('collect', { n: skin.cost }), cx, cy + 244 * u, 13 * u, hsl(48, 100, 72), 700, 0.9);
      ctx.save();
      ctx.scale(u, u);
      drawComet(cx / u, (cy + 196 * u) / u, skinHue(S.skinView), 0.5);
      ctx.restore();
    } else {
      for (let i = 0; i < Skins.length; i++) {
        const dx = (i - (Skins.length - 1) / 2) * 12 * u;
        ctx.fillStyle = i === S.skinView ? '#fff' : skinUnlocked(i) ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(cx + dx, cy + 244 * u, (i === S.skinView ? 3.5 : 2.5) * u, 0, TAU);
        ctx.fill();
      }
    }

    const pulse = 0.5 + 0.5 * Math.sin(S.t * 4);
    pillButton('play', cx, cy + 296 * u, 220 * u, 56 * u, t('play'), 265, pulse);
  }

  function drawHUD(cx, cy) {
    const bump = S.scoreBump;
    text(String(S.score), cx, 66 * u, 60 * u * (1 + bump * 0.22), '#fff', 900, 0.96, true);
    if (S.best > 0) text(`${t('best')} ${S.best}`, cx, 108 * u, 14 * u, '#fff', 700, 0.55);
    if (S.streak > 1) {
      const w = 64 * u;
      chip(cx, 134 * u, 24 * u, () => text(`×${S.streak}`, cx, 135 * u, 14 * u, hsl(48, 100, 70), 900), w);
    }

    iconButton('pause', 14 * u + 18 * u, 14 * u + 18 * u, 18 * u, drawPauseIcon);
    drawStarCount(14 * u + 18 * u, 72 * u, 15 * u, S.runStars, 0.9);

    if (S.hint) text(t('how_to'), cx, cy + 285 * u, 18 * u, '#fff', 700, 0.55 + 0.45 * Math.sin(S.t * 4), true);
  }

  function drawBanners(cx, cy) {
    for (const b of S.banners) {
      const age = b.max - b.life;
      const a = Math.min(clamp(age * 6, 0, 1), clamp(b.life * 3, 0, 1));
      const pop = 1 + 0.35 * Math.max(0, 1 - age * 5);
      if (b.big) {
        const y = cy - 60 * u;
        ctx.fillStyle = `rgba(0, 0, 0, ${0.25 * a})`;
        ctx.fillRect(0, y - 40 * u, W, 80 * u);
        text(b.text.toUpperCase(), cx, y, 38 * u * pop, hsl(b.hue, 100, 82), 900, a, true);
      } else {
        const y = cy - 175 * u;
        text(b.text.toUpperCase(), cx, y, 30 * u * pop, hsl(b.hue, 100, 70), 900, a, true);
        if (b.sub) text(b.sub, cx, y + 32 * u, 22 * u * pop, '#fff', 900, a, true);
      }
    }
  }

  function drawGameOver(cx, cy) {
    const a = ease((S.overT - 0.35) / 0.45);
    if (a <= 0) return;
    dim(0.55 * a);

    const cardW = 320 * u;
    const cardH = S.unlocked != null ? 330 * u : 270 * u;
    const top = cy - 200 * u + (1 - a) * 80 * u;
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, top, 0, top + cardH);
    g.addColorStop(0, 'rgba(48, 36, 110, 0.9)');
    g.addColorStop(1, 'rgba(18, 14, 48, 0.92)');
    ctx.fillStyle = g;
    roundRect(cx - cardW / 2, top, cardW, cardH, 26 * u);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 170, 255, 0.35)';
    ctx.lineWidth = Math.max(1, 1.5 * u);
    ctx.stroke();
    ctx.globalAlpha = 1;

    text(t('game_over'), cx, top + 40 * u, 22 * u, 'rgba(255,255,255,0.8)', 700, a);
    const shown = Math.round(S.score * ease((S.overT - 0.5) / 0.8));
    text(String(shown), cx, top + 112 * u, 88 * u, '#fff', 900, a, true);

    if (S.newBest && S.overT > 1.2) {
      const p = ease((S.overT - 1.2) / 0.3);
      const w = measure(t('new_best'), 16 * u, 900) + 34 * u;
      ctx.save();
      ctx.translate(cx, top + 172 * u);
      ctx.scale(lerp(1.6, 1, p), lerp(1.6, 1, p));
      ctx.globalAlpha = a * p;
      ctx.fillStyle = hsl(46, 100, 58);
      roundRect(-w / 2, -15 * u, w, 30 * u, 15 * u);
      ctx.fill();
      ctx.globalAlpha = 1;
      text(t('new_best'), 0, 1, 16 * u, '#2a1a00', 900, a * p);
      ctx.restore();
    } else if (!S.newBest) {
      text(`${t('best')} ${S.best}`, cx, top + 172 * u, 17 * u, hsl(48, 100, 75), 800, a);
    }

    // Stars collected this run and sector reached.
    const rowY = top + 222 * u;
    chip(cx - 62 * u, rowY, 32 * u, () => drawStarCount(cx - 62 * u, rowY, 15 * u, `+${S.runStars}`, a), 100 * u);
    const sectorLabel = `${t('sector')} ${S.sector}`;
    const sw = Math.max(100 * u, measure(sectorLabel, 14 * u, 800) + 24 * u);
    chip(cx + 62 * u, rowY, 32 * u, () => text(sectorLabel, cx + 62 * u, rowY + 1, 14 * u, '#fff', 800, a * 0.85), sw);

    if (S.unlocked != null && S.overT > 1.3) {
      const p = ease((S.overT - 1.3) / 0.4);
      const y = top + 284 * u;
      ctx.save();
      ctx.scale(u, u);
      drawComet((cx - 110 * u) / u, y / u, skinHue(S.unlocked), 0.7 + 0.1 * Math.sin(S.t * 6));
      ctx.restore();
      text(t('unlocked'), cx + 12 * u, y - 10 * u, 15 * u, hsl(48, 100, 75), 800, a * p);
      text(Skins[S.unlocked].name.toUpperCase(), cx + 12 * u, y + 12 * u, 15 * u, '#fff', 900, a * p);
    }

    if (S.overT > 0.9) {
      const pulse = 0.5 + 0.5 * Math.sin(S.t * 4);
      pillButton('again', cx, top + cardH + 58 * u, 240 * u, 58 * u, t('play_again'), 265, pulse);
    }
  }

  function drawPaused(cx, cy) {
    dim(0.6);
    text(t('paused'), cx, cy - 40 * u, 42 * u, '#fff', 900, 1, true);
    pillButton('resume', cx, cy + 40 * u, 220 * u, 56 * u, t('play'), 265, 0.5 + 0.5 * Math.sin(S.t * 4));
    text(t('tap_resume'), cx, cy + 100 * u, 15 * u, '#fff', 600, 0.6);
  }

  function drawUI() {
    const cx = W / 2;
    const cy = H / 2;
    S.buttons = [];

    if (S.state === 'title') drawTitle(cx, cy);
    if (S.state === 'playing') {
      drawHUD(cx, cy);
      drawBanners(cx, cy);
    }
    if (S.state === 'over') drawGameOver(cx, cy);
    if (S.paused && S.state === 'playing') {
      S.buttons = [];
      drawPaused(cx, cy);
    }

    if (S.state !== 'loading') {
      iconButton('mute', W - 14 * u - 18 * u, 14 * u + 18 * u, 18 * u, drawMuteIcon);
    }
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();
    drawWorld();
    drawUI();
    if (S.flash > 0.01) {
      ctx.fillStyle = S.flashHue === 0 ? `rgba(255, 90, 70, ${S.flash})` : `rgba(255, 245, 210, ${S.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (S.fade > 0.01) {
      ctx.fillStyle = `rgba(5, 4, 20, ${S.fade})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ------------------------------------------------------------- lifecycle

  let last = performance.now();
  let firstFrameSent = false;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
    last = now;
    const frozen = S.paused && S.state === 'playing';
    if (!frozen && !document.hidden) {
      update(S.slowT > 0 ? dt * 0.3 : dt);
      S.slowT -= dt;
      if (S.state === 'over') S.overT += dt;
      S.flash = Math.max(0, S.flash - dt * 1.5);
      if (S.state !== 'loading') S.fade = Math.max(0, S.fade - dt * 2.5);
    }
    render();
    if (!firstFrameSent) {
      firstFrameSent = true;
      Platform.firstFrameReady();
      boot();
    }
  }

  async function boot() {
    const [raw, lang] = await Promise.all([Platform.loadData(), Platform.getLanguage()]);
    restore(raw);
    I18N.set(lang);
    GameAudio.setSdkEnabled(Platform.isAudioEnabled());
    Platform.onAudioEnabledChange((on) => GameAudio.setSdkEnabled(on));
    Platform.onPause(() => {
      S.paused = true;
      GameAudio.pause();
    });
    Platform.onResume(() => {
      GameAudio.resume();
      // Mid-run the game stays frozen behind the pause screen; menus just continue.
      if (S.state !== 'playing') S.paused = false;
      last = performance.now();
    });
    S.state = 'title';
    Platform.gameReady();
  }

  window.addEventListener('error', () => Platform.logError());
  window.addEventListener('unhandledrejection', () => Platform.logError());

  resize();
  reset();
  requestAnimationFrame(frame);
})();
