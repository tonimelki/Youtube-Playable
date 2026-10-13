// Thin wrapper around the YouTube Playables SDK (window.ytgame).
//
// Inside YouTube every call goes to the real SDK. Anywhere else (local dev,
// GitHub Pages demo link) it falls back to browser equivalents so the same
// build runs unchanged in both places.
(function () {
  'use strict';

  const yt = window.ytgame;
  const inPlayables = !!(yt && yt.IN_PLAYABLES_ENV);
  const SAVE_KEY = 'orbit-hop-save-v1';

  function attempt(fn, fallback) {
    try {
      return fn();
    } catch (err) {
      console.warn('[platform]', err);
      return fallback;
    }
  }

  const Platform = {
    inPlayables,

    // Call once the first frame has been drawn.
    firstFrameReady() {
      if (inPlayables) attempt(() => yt.game.firstFrameReady());
    },

    // Call once the game is interactive (save data + language loaded).
    gameReady() {
      if (inPlayables) attempt(() => yt.game.gameReady());
    },

    async loadData() {
      if (inPlayables) {
        try {
          return (await yt.game.loadData()) || '';
        } catch (err) {
          console.warn('[platform] loadData failed', err);
          Platform.logWarning();
          return '';
        }
      }
      return attempt(() => localStorage.getItem(SAVE_KEY) || '', '');
    },

    async saveData(data) {
      if (inPlayables) {
        try {
          await yt.game.saveData(data);
        } catch (err) {
          console.warn('[platform] saveData failed', err);
          Platform.logWarning();
        }
        return;
      }
      attempt(() => localStorage.setItem(SAVE_KEY, data));
    },

    async getLanguage() {
      if (inPlayables) {
        try {
          return await yt.system.getLanguage();
        } catch (err) {
          console.warn('[platform] getLanguage failed', err);
        }
      }
      return navigator.language || 'en';
    },

    isAudioEnabled() {
      if (inPlayables) return attempt(() => yt.system.isAudioEnabled(), true);
      return true;
    },

    onAudioEnabledChange(cb) {
      if (inPlayables) attempt(() => yt.system.onAudioEnabledChange(cb));
    },

    onPause(cb) {
      if (inPlayables) {
        attempt(() => yt.system.onPause(cb));
        return;
      }
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) cb();
      });
    },

    onResume(cb) {
      if (inPlayables) {
        attempt(() => yt.system.onResume(cb));
        return;
      }
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) cb();
      });
    },

    sendScore(value) {
      if (!inPlayables) return;
      attempt(() => {
        yt.engagement.sendScore({ value: Math.max(0, Math.floor(value)) })
          .catch((err) => console.warn('[platform] sendScore failed', err));
      });
    },

    logError() {
      if (inPlayables) attempt(() => yt.health.logError());
    },

    logWarning() {
      if (inPlayables) attempt(() => yt.health.logWarning());
    },
  };

  window.Platform = Platform;
})();
