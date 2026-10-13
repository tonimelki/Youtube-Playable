// Procedural art. Everything is painted once into offscreen canvases and then
// blitted each frame, so the game ships no image files and stays fast.
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const RES = 2; // sprite pixels per world unit

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // Small deterministic RNG so a planet always looks the same.
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;

  // ------------------------------------------------------------------ glows

  const glowCache = new Map();

  // Soft radial blob, meant to be drawn with 'lighter' compositing.
  function glow(hue, sat = 100, light = 65) {
    const key = `${hue | 0}:${sat}:${light}`;
    let c = glowCache.get(key);
    if (c) return c;
    c = makeCanvas(64, 64);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, hsl(hue, sat, light, 1));
    grad.addColorStop(0.25, hsl(hue, sat, light, 0.55));
    grad.addColorStop(0.6, hsl(hue, sat, light, 0.15));
    grad.addColorStop(1, hsl(hue, sat, light, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(key, c);
    return c;
  }

  // ---------------------------------------------------------------- planets

  const PLANET_TYPES = ['rocky', 'gas', 'ice', 'lava', 'gas', 'rocky'];

  function paintRocky(g, cx, R, hue, rnd) {
    g.fillStyle = hsl(hue, 45, 52);
    g.fillRect(0, 0, cx * 2, cx * 2);
    // Continents / mottling.
    for (let i = 0; i < 14; i++) {
      g.fillStyle = hsl(hue + (rnd() - 0.5) * 30, 40 + rnd() * 20, 40 + rnd() * 25, 0.45);
      g.beginPath();
      g.arc(cx + (rnd() - 0.5) * R * 2, cx + (rnd() - 0.5) * R * 2, R * (0.15 + rnd() * 0.4), 0, TAU);
      g.fill();
    }
    // Craters with a lit rim.
    const n = 5 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * R * 0.8;
      const x = cx + Math.cos(a) * d;
      const y = cx + Math.sin(a) * d;
      const r = R * (0.07 + rnd() * 0.16);
      g.fillStyle = hsl(hue, 35, 28, 0.55);
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.strokeStyle = hsl(hue, 50, 78, 0.35);
      g.lineWidth = Math.max(1, r * 0.22);
      g.beginPath();
      g.arc(x + r * 0.12, y + r * 0.12, r, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
    }
  }

  function paintGas(g, cx, R, hue, rnd) {
    g.fillStyle = hsl(hue, 60, 55);
    g.fillRect(0, 0, cx * 2, cx * 2);
    const bands = 7 + Math.floor(rnd() * 5);
    for (let i = 0; i < bands; i++) {
      const y0 = cx - R + (i / bands) * R * 2 + (rnd() - 0.5) * 6;
      const h = R * (0.08 + rnd() * 0.22);
      const amp = 1 + rnd() * 4;
      const freq = 0.02 + rnd() * 0.05;
      const ph = rnd() * TAU;
      g.fillStyle = hsl(hue + (rnd() - 0.5) * 40, 55 + rnd() * 30, 35 + rnd() * 40, 0.5);
      g.beginPath();
      g.moveTo(0, y0);
      for (let x = 0; x <= cx * 2; x += 4) g.lineTo(x, y0 + Math.sin(x * freq + ph) * amp);
      for (let x = cx * 2; x >= 0; x -= 4) g.lineTo(x, y0 + h + Math.sin(x * freq + ph + 1) * amp);
      g.closePath();
      g.fill();
    }
    // A storm eye.
    if (rnd() < 0.7) {
      const x = cx + (rnd() - 0.5) * R;
      const y = cx + (rnd() - 0.2) * R * 0.8;
      g.fillStyle = hsl(hue + 25, 80, 70, 0.6);
      g.beginPath();
      g.ellipse(x, y, R * 0.22, R * 0.12, 0, 0, TAU);
      g.fill();
      g.fillStyle = hsl(hue + 25, 70, 45, 0.6);
      g.beginPath();
      g.ellipse(x, y, R * 0.12, R * 0.06, 0, 0, TAU);
      g.fill();
    }
  }

  function paintIce(g, cx, R, hue, rnd) {
    const grad = g.createLinearGradient(0, 0, 0, cx * 2);
    grad.addColorStop(0, hsl(hue, 70, 88));
    grad.addColorStop(1, hsl(hue + 20, 55, 62));
    g.fillStyle = grad;
    g.fillRect(0, 0, cx * 2, cx * 2);
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = cx + (rnd() - 0.5) * R * 2;
      let y = cx + (rnd() - 0.5) * R * 2;
      g.strokeStyle = hsl(hue + 10, 60, 45, 0.45);
      g.lineWidth = 1 + rnd() * 2;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.5) * R * 0.6;
        y += (rnd() - 0.5) * R * 0.6;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255, 255, 255, ${0.3 + rnd() * 0.5})`;
      g.fillRect(cx + (rnd() - 0.5) * R * 2, cx + (rnd() - 0.5) * R * 2, 1.5, 1.5);
    }
  }

  function paintLava(g, cx, R, hue, rnd) {
    g.fillStyle = hsl(hue, 30, 18);
    g.fillRect(0, 0, cx * 2, cx * 2);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = hsl(hue, 25, 12 + rnd() * 12, 0.7);
      g.beginPath();
      g.arc(cx + (rnd() - 0.5) * R * 2, cx + (rnd() - 0.5) * R * 2, R * (0.15 + rnd() * 0.3), 0, TAU);
      g.fill();
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.shadowColor = hsl(hue + 20, 100, 55);
    g.shadowBlur = 8;
    for (let i = 0; i < 7; i++) {
      let x = cx + (rnd() - 0.5) * R * 1.8;
      let y = cx + (rnd() - 0.5) * R * 1.8;
      g.strokeStyle = hsl(hue + 25 + rnd() * 20, 100, 55 + rnd() * 15);
      g.lineWidth = 1.5 + rnd() * 2.5;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rnd() - 0.5) * R * 0.7;
        y += (rnd() - 0.5) * R * 0.7;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.shadowBlur = 0;
  }

  const PAINTERS = { rocky: paintRocky, gas: paintGas, ice: paintIce, lava: paintLava };

  // Returns { img, size, type, hasRing, atmo } — img already includes the
  // day/night shading and atmosphere rim so drawing is a single blit.
  function planet(r, hue, seed, opts = {}) {
    const rnd = rng(seed);
    const type = opts.type || PLANET_TYPES[Math.floor(rnd() * PLANET_TYPES.length)];
    if (type === 'lava') hue = 5 + rnd() * 25;
    if (type === 'ice') hue = 180 + rnd() * 50;

    const R = r * RES;
    const pad = 4 * RES;
    const size = R * 2 + pad * 2;
    const cx = size / 2;
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');

    g.save();
    g.beginPath();
    g.arc(cx, cx, R, 0, TAU);
    g.clip();
    PAINTERS[type](g, cx, R, hue, rnd);

    // Light from the upper left: highlight + terminator shadow.
    const shade = g.createRadialGradient(cx - R * 0.45, cx - R * 0.5, R * 0.05, cx - R * 0.15, cx - R * 0.2, R * 1.45);
    shade.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
    shade.addColorStop(0.35, 'rgba(255, 255, 255, 0)');
    shade.addColorStop(0.75, 'rgba(0, 0, 20, 0.35)');
    shade.addColorStop(1, 'rgba(0, 0, 20, 0.85)');
    g.fillStyle = shade;
    g.fillRect(0, 0, size, size);
    g.restore();

    // Atmosphere rim.
    const atmoHue = type === 'lava' ? hue + 15 : hue;
    g.strokeStyle = hsl(atmoHue, 100, 78, 0.55);
    g.lineWidth = 1.5 * RES;
    g.beginPath();
    g.arc(cx, cx, R - 0.5 * RES, Math.PI * 0.75, Math.PI * 1.75);
    g.stroke();

    return {
      img: c,
      size: size / RES,
      type,
      hue,
      atmo: atmoHue,
      hasRing: opts.ring != null ? opts.ring : type === 'gas' && rnd() < 0.6,
      ringTilt: (rnd() - 0.5) * 0.7,
      ringHue: hue + (rnd() - 0.5) * 60,
    };
  }

  // ---------------------------------------------------------------- nebulae

  // A vertically tileable nebula texture in the given palette.
  function nebula(hues, seed) {
    const rnd = rng(seed);
    const w = 256;
    const h = 512;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = 40 + rnd() * 120;
      const hue = hues[Math.floor(rnd() * hues.length)] + (rnd() - 0.5) * 20;
      const a = 0.05 + rnd() * 0.12;
      // Draw three times shifted by the tile height so the texture wraps.
      for (const oy of [-h, 0, h]) {
        const grad = g.createRadialGradient(x, y + oy, 0, x, y + oy, r);
        grad.addColorStop(0, hsl(hue, 80, 55, a));
        grad.addColorStop(1, hsl(hue, 80, 55, 0));
        g.fillStyle = grad;
        g.fillRect(x - r, y + oy - r, r * 2, r * 2);
      }
    }
    return c;
  }

  window.Art = { glow, planet, nebula, hsl, rng };
})();
