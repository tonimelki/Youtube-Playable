// Tiny Web Audio synth: every sound is generated in code, so the bundle ships
// no audio files. Output is silent whenever YouTube reports audio disabled or
// the player has muted the game.
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let sdkEnabled = true;
  let paused = false;

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
        master = ctx.createGain();
        master.connect(ctx.destination);
        apply();
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

    pause() {
      paused = true;
      if (ctx) ctx.suspend();
    },

    resume() {
      paused = false;
      if (ctx) ctx.resume();
    },

    play(name, level = 0) {
      if (!ctx || !GameAudio.enabled || paused) return;
      switch (name) {
        case 'start':
          tone(440, 0.12, 'triangle', 0.2, 660);
          tone(660, 0.16, 'triangle', 0.18, 880, 0.08);
          break;
        case 'launch':
          tone(260, 0.16, 'triangle', 0.22, 620);
          break;
        case 'capture': {
          const base = 440 * Math.pow(2, Math.min(level, 10) / 12);
          tone(base, 0.18, 'sine', 0.28);
          tone(base * 1.5, 0.24, 'sine', 0.2, null, 0.06);
          break;
        }
        case 'perfect': {
          const base = 523 * Math.pow(2, Math.min(level, 10) / 12);
          tone(base, 0.14, 'sine', 0.26);
          tone(base * 1.26, 0.14, 'sine', 0.22, null, 0.06);
          tone(base * 1.5, 0.3, 'sine', 0.22, null, 0.12);
          break;
        }
        case 'star':
          tone(1320, 0.08, 'square', 0.06, 1760);
          tone(1760, 0.14, 'square', 0.05, 2200, 0.05);
          break;
        case 'die':
          tone(320, 0.55, 'sawtooth', 0.16, 55);
          tone(160, 0.6, 'triangle', 0.18, 40, 0.05);
          break;
      }
    },
  };

  function apply() {
    if (!master) return;
    master.gain.setTargetAtTime(GameAudio.enabled ? 0.5 : 0, ctx.currentTime, 0.02);
  }

  function tone(freq, dur, type, vol, slideTo = null, delay = 0) {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  window.GameAudio = GameAudio;
})();
