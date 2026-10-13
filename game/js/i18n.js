// UI strings. The language comes from ytgame.system.getLanguage() (BCP-47),
// falling back to English for anything not listed here.
(function () {
  'use strict';

  const STRINGS = {
    en: {
      play: 'Play',
      play_again: 'Play again',
      sector: 'Sector',
      stars: 'Stars',
      unlocked: 'New comet unlocked!',
      collect: 'Collect {n} stars',
      tap_start: 'Tap to start',
      how_to: 'Tap to leap from planet to planet',
      best: 'Best',
      new_best: 'New best!',
      game_over: 'Lost in space',
      tap_retry: 'Tap to play again',
      paused: 'Paused',
      tap_resume: 'Tap to resume',
      perfect: 'Perfect',
    },
    es: {
      play: 'Jugar',
      play_again: 'Jugar de nuevo',
      sector: 'Sector',
      stars: 'Estrellas',
      unlocked: '¡Nuevo cometa desbloqueado!',
      collect: 'Reúne {n} estrellas',
      tap_start: 'Toca para empezar',
      how_to: 'Toca para saltar de planeta en planeta',
      best: 'Récord',
      new_best: '¡Nuevo récord!',
      game_over: 'Perdido en el espacio',
      tap_retry: 'Toca para jugar de nuevo',
      paused: 'En pausa',
      tap_resume: 'Toca para continuar',
      perfect: 'Perfecto',
    },
    fr: {
      play: 'Jouer',
      play_again: 'Rejouer',
      sector: 'Secteur',
      stars: 'Étoiles',
      unlocked: 'Nouvelle comète débloquée !',
      collect: 'Récoltez {n} étoiles',
      tap_start: 'Touchez pour commencer',
      how_to: 'Touchez pour sauter de planète en planète',
      best: 'Record',
      new_best: 'Nouveau record !',
      game_over: "Perdu dans l'espace",
      tap_retry: 'Touchez pour rejouer',
      paused: 'Pause',
      tap_resume: 'Touchez pour reprendre',
      perfect: 'Parfait',
    },
    pt: {
      play: 'Jogar',
      play_again: 'Jogar de novo',
      sector: 'Setor',
      stars: 'Estrelas',
      unlocked: 'Novo cometa desbloqueado!',
      collect: 'Colete {n} estrelas',
      tap_start: 'Toque para começar',
      how_to: 'Toque para saltar de planeta em planeta',
      best: 'Recorde',
      new_best: 'Novo recorde!',
      game_over: 'Perdido no espaço',
      tap_retry: 'Toque para jogar de novo',
      paused: 'Pausado',
      tap_resume: 'Toque para continuar',
      perfect: 'Perfeito',
    },
    de: {
      play: 'Spielen',
      play_again: 'Nochmal spielen',
      sector: 'Sektor',
      stars: 'Sterne',
      unlocked: 'Neuer Komet freigeschaltet!',
      collect: 'Sammle {n} Sterne',
      tap_start: 'Zum Starten tippen',
      how_to: 'Tippe, um von Planet zu Planet zu springen',
      best: 'Rekord',
      new_best: 'Neuer Rekord!',
      game_over: 'Im All verloren',
      tap_retry: 'Tippen, um erneut zu spielen',
      paused: 'Pausiert',
      tap_resume: 'Zum Fortsetzen tippen',
      perfect: 'Perfekt',
    },
    it: {
      play: 'Gioca',
      play_again: 'Gioca ancora',
      sector: 'Settore',
      stars: 'Stelle',
      unlocked: 'Nuova cometa sbloccata!',
      collect: 'Raccogli {n} stelle',
      tap_start: 'Tocca per iniziare',
      how_to: "Tocca per saltare da un pianeta all'altro",
      best: 'Record',
      new_best: 'Nuovo record!',
      game_over: 'Perso nello spazio',
      tap_retry: 'Tocca per giocare ancora',
      paused: 'In pausa',
      tap_resume: 'Tocca per riprendere',
      perfect: 'Perfetto',
    },
    ar: {
      play: 'العب',
      play_again: 'العب مجددًا',
      sector: 'القطاع',
      stars: 'النجوم',
      unlocked: 'تم فتح مذنب جديد!',
      collect: 'اجمع {n} نجمة',
      tap_start: 'اضغط للبدء',
      how_to: 'اضغط للقفز من كوكب إلى آخر',
      best: 'الأفضل',
      new_best: 'رقم قياسي جديد!',
      game_over: 'ضائع في الفضاء',
      tap_retry: 'اضغط للعب مجددًا',
      paused: 'متوقف مؤقتًا',
      tap_resume: 'اضغط للمتابعة',
      perfect: 'ممتاز',
    },
    ja: {
      play: 'プレイ',
      play_again: 'もう一度',
      sector: 'セクター',
      stars: 'スター',
      unlocked: '新しいすい星を解放！',
      collect: 'スターを{n}個集めよう',
      tap_start: 'タップでスタート',
      how_to: 'タップして惑星から惑星へジャンプ',
      best: 'ベスト',
      new_best: '新記録！',
      game_over: '宇宙で迷子',
      tap_retry: 'タップでもう一度',
      paused: '一時停止中',
      tap_resume: 'タップで再開',
      perfect: 'パーフェクト',
    },
  };

  const RTL = new Set(['ar', 'he', 'fa', 'ur']);

  const I18N = {
    lang: 'en',
    rtl: false,

    set(tag) {
      const base = String(tag || 'en').toLowerCase().split(/[-_]/)[0];
      I18N.lang = STRINGS[base] ? base : 'en';
      I18N.rtl = RTL.has(I18N.lang);
      document.documentElement.lang = I18N.lang;
      document.documentElement.dir = I18N.rtl ? 'rtl' : 'ltr';
    },

    t(key, vars) {
      let str = STRINGS[I18N.lang][key] || STRINGS.en[key] || key;
      if (vars) for (const k in vars) str = str.replace(`{${k}}`, vars[k]);
      return str;
    },
  };

  window.I18N = I18N;
})();
