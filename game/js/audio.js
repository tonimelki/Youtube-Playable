// Web Audio sound: synthesized effects plus a generative ambient soundtrack.
// Every sound is generated in code, so the bundle ships no audio files.
// Output is silent whenever YouTube reports audio disabled or the player has
// muted the game.
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let delayIn = null;
  let sdkEnabled = true;
  let paused = false;

  // ------------------------------------------------------------------ music

  // A minor: Am – F – C – G, two bars each, eighth notes at 84 BPM.
  const BPM = 84;
  const STEP = 60 / BPM / 2;
  const CHORDS = [
    [0, 3, 7],
    [-4, 0, 3],
    [3, 7, 10],
    [-2, 2, 5],
  ];
  const ARP = [0, 2, 1, 3, 2, 4, 3, 1];
  const STEPS_PER_CHORD = 16;

  let nextTime = 0;
  let step = 0;
  let intensity = 0; // 0 = menu (pad + bass), 1 = in game (adds arpeggio)

  const freq = (semi, base = 220) => base * Math.pow(2, semi / 12);

  function scheduleMusic() {
    if (!ctx || paused) return;
    while (nextTime < ctx.currentTime + 0.3) {
      if (GameAudio.enabled) playStep(step, nextTime);
      nextTime += STEP;
      step++;
    }
  }

  function playStep(i, t0) {
    const chord = CHORDS[Math.floor(i / STEPS_PER_CHORD) % CHORDS.length];
    const inChord = i % STEPS_PER_CHORD;

    if (inChord === 0) {
      for (const semi of chord) {
        voice(musicBus, freq(semi, 220), t0, STEP * STEPS_PER_CHORD, 'sine', 0.05, 1.2);
        voice(musicBus, freq(semi + 12, 220) * 1.003, t0, STEP * STEPS_PER_CHORD, 'triangle', 0.015, 1.5);
      }
    }
    if (inChord % 4 === 0) {
      voice(musicBus, freq(chord[0] - 12, 110), t0, STEP * 3, 'sine', 0.12, 0.02);
    }
    if (intensity > 0) {
      const tones = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12];
      const semi = tones[ARP[i % ARP.length] % tones.length];
      voice(delayIn, freq(semi + 12, 220), t0, STEP * 0.9, 'triangle', 0.045, 0.005);
    }
  }

  function voice(bus, f, t0, dur, type, vol, attack) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // --------------------------------------------------------------- effects

  function tone(f, dur, type, vol, slideTo = null, delay = 0) {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, cutoff) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    src.start();
  }

  function build() {
    master = ctx.createGain();
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2400;
    lowpass.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.gain.setTargetAtTime(0.8, ctx.currentTime, 1.5);
    musicBus.connect(lowpass);

    // Echo for the arpeggio.
    delayIn = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    delayIn.connect(musicBus);
    delayIn.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(musicBus);

    apply();
    nextTime = ctx.currentTime + 0.1;
    setInterval(scheduleMusic, 60);
  }

  function apply() {
    if (!master) return;
    master.gain.setTargetAtTime(GameAudio.enabled ? 0.55 : 0, ctx.currentTime, 0.03);
  }

  const GameAudio = {
    userMuted: false,

    get enabled() {
      return sdkEnabled && !GameAudio.userMuted;
    },

    // Browsers only allow an AudioContext to start from a user gesture.
    unlock() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        build();
      }
      if (ctx.state === 'suspended' && !paused) ctx.resume();
    },

    setSdkEnabled(on) {
      sdkEnabled = !!on;
      apply();
    },

    toggleMute() {
      GameAudio.userMuted = !GameAudio.userMuted;
      apply();
    },

    setIntensity(level) {
      intensity = level;
    },

    pause() {
      paused = true;
      if (ctx) ctx.suspend();
    },

    resume() {
      paused = false;
      if (ctx) {
        ctx.resume();
        nextTime = Math.max(nextTime, ctx.currentTime + 0.05);
      }
    },

    play(name, level = 0) {
      if (!ctx || !GameAudio.enabled || paused) return;
      switch (name) {
        case 'ui':
          tone(880, 0.06, 'triangle', 0.12, 1100);
          break;
        case 'start':
          tone(440, 0.12, 'triangle', 0.2, 660);
          tone(660, 0.18, 'triangle', 0.18, 990, 0.08);
          break;
        case 'launch':
          tone(260, 0.16, 'triangle', 0.2, 620);
          noise(0.12, 0.08, 3000);
          break;
        case 'capture': {
          const base = freq(level % 5 === 0 ? 0 : [0, 3, 7, 10, 12][level % 5], 440);
          tone(base, 0.18, 'sine', 0.26);
          tone(base * 1.5, 0.24, 'sine', 0.18, null, 0.06);
          break;
        }
        case 'perfect': {
          const base = freq(Math.min(level, 8) * 2, 523);
          tone(base, 0.14, 'sine', 0.24);
          tone(base * 1.26, 0.14, 'sine', 0.2, null, 0.06);
          tone(base * 1.5, 0.35, 'sine', 0.2, null, 0.12);
          tone(base * 2, 0.4, 'triangle', 0.06, null, 0.12);
          break;
        }
        case 'star':
          tone(1320, 0.08, 'square', 0.05, 1760);
          tone(1760, 0.16, 'square', 0.04, 2640, 0.05);
          break;
        case 'warn':
          tone(220, 0.08, 'square', 0.05);
          break;
        case 'sector':
          tone(392, 0.3, 'triangle', 0.14);
          tone(523, 0.3, 'triangle', 0.14, null, 0.12);
          tone(784, 0.6, 'triangle', 0.14, null, 0.24);
          break;
        case 'unlock':
          [0, 4, 7, 12, 16].forEach((s, i) => tone(freq(s, 523), 0.3, 'triangle', 0.12, null, i * 0.07));
          break;
        case 'die':
          tone(320, 0.55, 'sawtooth', 0.12, 55);
          tone(160, 0.6, 'triangle', 0.16, 40, 0.05);
          noise(0.6, 0.25, 1600);
          break;
      }
    },
  };

  window.GameAudio = GameAudio;
})();
