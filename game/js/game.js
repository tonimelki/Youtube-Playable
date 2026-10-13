// Orbit Hop: tap to leap off your orbit and get captured by the next planet.
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const t = (key) => I18N.t(key);

  // The game is designed on a 420x720 playfield that is always fully visible;
  // extra screen space on any side just shows more of the background.
  const FIELD_W = 420;
  const FIELD_H = 720;
  const LAUNCH_SPEED = 600;
  const MAX_FLIGHT = 1.6;
  const ORBIT_GAP = 16;
  const STAR_RADIUS = 20;
  const TAU = Math.PI * 2;
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", "Noto Sans JP", sans-serif';

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

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
    trail: [],
    player: null,
    cur: null,
    camY: 0,
    shake: 0,
    score: 0,
    best: 0,
    games: 0,
    totalStars: 0,
    streak: 0,
    newBest: false,
    overT: 0,
    hint: false,
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
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    u = Math.min(W / FIELD_W, H / FIELD_H);
  }

  const halfW = () => W / 2 / u;
  const halfH = () => H / 2 / u;

  function muteButton() {
    const r = 18 * u;
    return { x: W - r - 14 * u, y: r + 14 * u, r };
  }

  // ----------------------------------------------------------------- world

  function makePlanet(x, y, r, level) {
    const craters = [];
    for (let i = 0; i < 3; i++) {
      craters.push({ a: rand(0, TAU), d: rand(0.2, 0.6), s: rand(0.12, 0.22) });
    }
    return {
      x, baseX: x, y, r, level,
      ring: r + 26,
      hue: (190 + level * 37) % 360,
      visited: false,
      moving: false, amp: 0, speed: 0, phase: 0,
      craters,
      pulse: 0,
      timer: 0,
      maxTime: 0,
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
    S.trail = [];

    const first = makePlanet(0, 0, 36, 0);
    first.visited = true;
    S.planets.push(first);
    S.cur = first;
    for (let i = 0; i < 5; i++) spawnNext();

    S.player = {
      x: 0, y: 0, vx: 0, vy: 0,
      angle: 0,
      dir: 1,
      orbitR: first.r + ORBIT_GAP,
      mode: 'orbit', // orbit | flight | dead
      flightT: 0,
    };
    S.camY = first.y - FIELD_H * 0.2;
    S.score = 0;
    S.streak = 0;
    S.newBest = false;
    S.overT = 0;
    S.shake = 0;
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
  }

  // --------------------------------------------------------------- effects

  function burst(x, y, hue, n, speed, life = 0.7) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.3, 1) * speed;
      S.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life, max: life,
        hue,
        size: rand(1.5, 3.5),
      });
    }
  }

  function popup(x, y, text, hue) {
    S.popups.push({ x, y, text, hue, life: 1 });
  }

  // -------------------------------------------------------------- gameplay

  function startRun() {
    S.state = 'playing';
    S.hint = S.games < 3;
    armTimer(S.cur);
    GameAudio.play('start');
  }

  function launch() {
    const pl = S.player;
    pl.mode = 'flight';
    pl.flightT = 0;
    pl.vx = -Math.sin(pl.angle) * pl.dir * LAUNCH_SPEED;
    pl.vy = Math.cos(pl.angle) * pl.dir * LAUNCH_SPEED;
    burst(pl.x, pl.y, 190, 8, 90, 0.4);
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
      pl.mode = 'orbit';
      pl.angle = Math.atan2(dy, dx);
      pl.dir = cross >= 0 ? 1 : -1;
      pl.orbitR = Math.sqrt(d2);

      if (perfect) {
        S.streak++;
        const pts = 1 + Math.min(S.streak, 4);
        S.score += pts;
        popup(p.x, p.y - p.r - 34, `${t('perfect')} +${pts}`, 50);
        burst(pl.x, pl.y, 50, 22, 220);
        GameAudio.play('perfect', S.streak);
      } else {
        S.streak = 0;
        S.score += 1;
        popup(p.x, p.y - p.r - 34, '+1', p.hue);
        burst(pl.x, pl.y, p.hue, 14, 160);
        GameAudio.play('capture', 0);
      }
      return true;
    }
    return false;
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
        S.score += 1;
        S.totalStars++;
        popup(s.x, s.y - 24, '+1', 48);
        burst(s.x, s.y, 48, 12, 140, 0.5);
        GameAudio.play('star');
      }
    }
  }

  function collapse(p) {
    p.collapsed = true;
    burst(p.x, p.y, p.hue, 30, 200, 0.9);
    die();
  }

  function die() {
    const pl = S.player;
    pl.mode = 'dead';
    S.state = 'over';
    S.overT = 0;
    S.shake = 10;
    burst(clamp(pl.x, -halfW(), halfW()), clamp(pl.y, S.camY - halfH(), S.camY + halfH()), 15, 40, 260, 1);
    GameAudio.play('die');

    S.games++;
    if (S.score > S.best) {
      S.best = S.score;
      S.newBest = true;
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
      GameAudio.userMuted = !!data.muted;
    } catch (err) {
      console.warn('Ignoring unreadable save data', err);
    }
  }

  // ----------------------------------------------------------------- input

  function handleTap(x, y) {
    if (x != null) {
      const b = muteButton();
      if (S.state !== 'loading' && Math.hypot(x - b.x, y - b.y) < b.r * 1.6) {
        GameAudio.toggleMute();
        persist();
        return;
      }
    }
    if (S.state === 'loading') return;
    if (S.paused) {
      S.paused = false;
      return;
    }
    if (S.state === 'title') {
      startRun();
    } else if (S.state === 'playing') {
      if (S.player.mode === 'orbit') launch();
    } else if (S.state === 'over' && S.overT > 0.6) {
      reset();
      startRun();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    GameAudio.unlock();
    handleTap(e.clientX, e.clientY);
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp') {
      e.preventDefault();
      GameAudio.unlock();
      handleTap(null, null);
    } else if (e.code === 'KeyM') {
      GameAudio.toggleMute();
      persist();
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
    if (S.state === 'over') {
      S.overT += dt;
    } else if (pl.mode === 'orbit') {
      const p = S.cur;
      pl.angle += pl.dir * omega() * dt;
      pl.orbitR = damp(pl.orbitR, p.r + ORBIT_GAP, 8, dt);
      pl.x = p.x + Math.cos(pl.angle) * pl.orbitR;
      pl.y = p.y + Math.sin(pl.angle) * pl.orbitR;
      if (S.state === 'playing') {
        p.timer -= dt;
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
      if (S.trail.length > 22) S.trail.shift();
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
      q.life -= dt;
    }
    S.particles = S.particles.filter((q) => q.life > 0);

    for (const p of S.popups) {
      p.y -= 40 * dt;
      p.life -= dt * 0.9;
    }
    S.popups = S.popups.filter((p) => p.life > 0);

    S.shake = Math.max(0, S.shake - dt * 30);
  }

  // ---------------------------------------------------------------- render

  function text(str, x, y, size, color, weight = 700, alpha = 1) {
    ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = I18N.rtl ? 'rtl' : 'ltr';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  function drawBackground() {
    const hue = (235 + Math.max(0, -S.camY) / 45) % 360;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${hue}, 55%, 8%)`);
    g.addColorStop(1, `hsl(${(hue + 35) % 360}, 55%, 17%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (const s of bgStars) {
      const f = 0.05 + s.layer * 0.12;
      let y = (s.y * H - S.camY * u * f) % H;
      if (y < 0) y += H;
      const a = 0.35 + 0.35 * Math.sin(S.t * 2 + s.tw) + s.layer * 0.1;
      ctx.globalAlpha = clamp(a, 0.1, 1);
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x * W, y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlanet(p) {
    const dim = p.visited && p !== S.cur;

    if (p.moving) {
      ctx.strokeStyle = `hsla(${p.hue}, 80%, 70%, 0.12)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.baseX - p.amp, p.y);
      ctx.lineTo(p.baseX + p.amp, p.y);
      ctx.stroke();
    }

    if (!p.visited) {
      ctx.setLineDash([5, 9]);
      ctx.lineDashOffset = -S.t * 12;
      ctx.lineWidth = 2;
      ctx.strokeStyle = `hsla(${p.hue}, 90%, 75%, 0.4)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.ring, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = `hsla(${p.hue}, 90%, 60%, ${dim ? 0.05 : 0.13 + p.pulse * 0.3})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 1.5 + p.pulse * 18, 0, TAU);
    ctx.fill();

    const g = ctx.createRadialGradient(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.1, p.x, p.y, p.r);
    g.addColorStop(0, `hsl(${p.hue}, ${dim ? 30 : 80}%, ${dim ? 45 : 72}%)`);
    g.addColorStop(1, `hsl(${(p.hue + 25) % 360}, ${dim ? 25 : 65}%, ${dim ? 20 : 32}%)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    for (const c of p.craters) {
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(c.a) * c.d * p.r, p.y + Math.sin(c.a) * c.d * p.r, c.s * p.r, 0, TAU);
      ctx.fill();
    }
  }

  // Countdown ring around the planet you're standing on.
  function drawTimer(p) {
    const k = clamp(p.timer / p.maxTime, 0, 1);
    const urgent = p.timer < 1;
    const blink = urgent ? 0.6 + 0.4 * Math.sin(S.t * 20) : 1;
    ctx.strokeStyle = urgent ? `hsla(0, 90%, 65%, ${blink})` : 'hsla(0, 0%, 100%, 0.45)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + ORBIT_GAP + 12, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
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

  function drawStar(s) {
    const y = s.y + Math.sin(S.t * 3 + s.phase) * 4;
    ctx.fillStyle = 'hsla(48, 100%, 60%, 0.18)';
    ctx.beginPath();
    ctx.arc(s.x, y, 17, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'hsl(48, 100%, 62%)';
    starPath(s.x, y, 10, 4.5, S.t * 1.5 + s.phase);
    ctx.fill();
  }

  function drawPlayer() {
    const pl = S.player;
    const n = S.trail.length;
    ctx.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const a = S.trail[i - 1];
      const b = S.trail[i];
      const k = i / n;
      ctx.strokeStyle = `hsla(190, 100%, 75%, ${k * 0.6})`;
      ctx.lineWidth = lerp(1, 7, k);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    if (pl.mode === 'dead') return;
    ctx.fillStyle = 'hsla(190, 100%, 70%, 0.28)';
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 6.5, 0, TAU);
    ctx.fill();
  }

  function drawWorld() {
    const sx = S.shake ? rand(-1, 1) * S.shake : 0;
    const sy = S.shake ? rand(-1, 1) * S.shake : 0;
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(u, u);
    ctx.translate(0, -S.camY);

    for (const p of S.planets) if (!p.collapsed) drawPlanet(p);
    if (S.state === 'playing') drawTimer(S.cur);
    for (const s of S.stars) drawStar(s);
    drawPlayer();

    for (const q of S.particles) {
      ctx.fillStyle = `hsla(${q.hue}, 100%, 70%, ${q.life / q.max})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size, 0, TAU);
      ctx.fill();
    }
    for (const p of S.popups) {
      text(p.text, p.x, p.y, 20, `hsl(${p.hue}, 100%, 75%)`, 800, clamp(p.life * 1.5, 0, 1));
    }
    ctx.restore();
  }

  function drawMuteButton() {
    const b = muteButton();
    const on = GameAudio.enabled;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();

    const s = b.r / 18;
    ctx.save();
    ctx.translate(b.x - 3 * s, b.y);
    ctx.scale(s, s);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-8, -4);
    ctx.lineTo(-3, -4);
    ctx.lineTo(3, -9);
    ctx.lineTo(3, 9);
    ctx.lineTo(-3, 4);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
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
    ctx.restore();
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(6, 6, 22, ${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawUI() {
    const cx = W / 2;
    const cy = H / 2;
    const pulse = 0.55 + 0.45 * Math.sin(S.t * 4);

    if (S.state === 'playing') {
      text(String(S.score), cx, 64 * u, 56 * u, '#fff', 800, 0.95);
      if (S.best > 0) text(`${t('best')} ${S.best}`, cx, 104 * u, 16 * u, '#fff', 600, 0.55);
      if (S.hint) text(t('how_to'), cx, cy + 270 * u, 19 * u, '#fff', 600, pulse);
    }

    if (S.state === 'title') {
      dim(0.35);
      text('ORBIT HOP', cx, cy - 220 * u, 52 * u, '#fff', 900);
      text(t('how_to'), cx, cy - 172 * u, 18 * u, 'hsl(190, 100%, 80%)', 600);
      if (S.best > 0) text(`${t('best')} ${S.best}`, cx, cy - 138 * u, 18 * u, 'hsl(48, 100%, 70%)', 700);
      text(t('tap_start'), cx, cy + 270 * u, 24 * u, '#fff', 700, pulse);
    }

    if (S.state === 'over') {
      const a = clamp(S.overT * 3, 0, 1);
      dim(0.55 * a);
      text(t('game_over'), cx, cy - 130 * u, 32 * u, '#fff', 700, a);
      text(String(S.score), cx, cy - 45 * u, 100 * u, '#fff', 900, a);
      if (S.newBest) {
        text(t('new_best'), cx, cy + 30 * u, 24 * u, 'hsl(48, 100%, 65%)', 800, a);
      } else {
        text(`${t('best')} ${S.best}`, cx, cy + 30 * u, 20 * u, '#fff', 600, a * 0.7);
      }
      if (S.overT > 0.6) text(t('tap_retry'), cx, cy + 120 * u, 22 * u, '#fff', 700, pulse);
    }

    if (S.paused && S.state === 'playing') {
      dim(0.6);
      text(t('paused'), cx, cy - 20 * u, 40 * u, '#fff', 800);
      text(t('tap_resume'), cx, cy + 30 * u, 20 * u, '#fff', 600, pulse);
    }

    if (S.state !== 'loading') drawMuteButton();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();
    drawWorld();
    drawUI();
  }

  // ------------------------------------------------------------- lifecycle

  let last = performance.now();
  let firstFrameSent = false;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
    last = now;
    const frozen = S.paused && S.state === 'playing';
    if (!frozen && !document.hidden) update(dt);
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
      // Mid-run the game stays frozen behind "Tap to resume"; menus just continue.
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
