/* Arka plan müziği — sahne animasyonlarından tamamen bağımsız çalışır.
   Varsayılan: SES AÇIK. Sayfa açılır açılmaz sesli çalmayı dener.
   Tarayıcılar (iPhone Safari, mobil Chrome) sesli otomatik oynatmayı ziyaretçi bir yere
   DOKUNANA kadar engeller (kaydırma dokunuş sayılmaz). Bu durumda müzik sessiz olarak
   hemen başlar ve ilk dokunuş / tıklama / tuşta kaldığı yerden sesli devam eder.
   Kapatma tercihi yalnızca o ziyaret boyunca geçerlidir; her yeni ziyarette ses açık gelir. */
(() => {
  const btn = document.querySelector('.sound');
  const audio = new Audio('assets/audio/fon-muzik-v3.mp3');
  audio.loop = true;
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');

  const TARGET = 0.45; // iOS ses düzeyini sayfaya bırakmaz; orada cihaz sesi geçerlidir
  const INTRO_LEVEL = 0.1; // açılıştaki zaman efekti sırasında müzik geride kalır
  let introActive = !!document.querySelector('.intro');
  const level = () => (introActive ? INTRO_LEVEL : TARGET);
  const KEY = 'uf-ses';
  let muted = false;
  try { muted = sessionStorage.getItem(KEY) === 'kapali'; } catch (e) {}
  try { localStorage.removeItem(KEY); } catch (e) {} // eski sürümün kalıcı "kapalı" kaydını temizle

  let blocked = false; // tarayıcı sesli oynatmayı engelledi; dokunuş bekleniyor

  let fadeRaf = 0;
  function fadeTo(v, ms) {
    cancelAnimationFrame(fadeRaf);
    const from = audio.volume, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (v - from) * k));
      if (k < 1) fadeRaf = requestAnimationFrame(step);
    };
    fadeRaf = requestAnimationFrame(step);
  }

  const audible = () => !muted && !audio.paused && !audio.muted;

  function render() {
    if (!btn) return;
    const on = audible();
    btn.classList.toggle('is-on', on);
    btn.classList.toggle('is-blocked', !muted && blocked);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Müziği kapat' : 'Müziği aç');
    const label = btn.querySelector('.sound__label');
    if (label) label.textContent = on ? 'Ses Açık' : 'Sesi aç';
  }

  const safePlay = () => {
    try { return Promise.resolve(audio.play()); } catch (e) { return Promise.reject(e); }
  };

  // 1) Sayfa açılışı: önce sesli dene; olmazsa sessiz başlat (her tarayıcı buna izin verir)
  function autostart() {
    if (muted) return;
    sfx.resume();
    audio.muted = false;
    audio.volume = 0;
    safePlay().then(() => {
      blocked = false;
      fadeTo(level(), 2200);
      detach();
      render();
    }).catch(() => {
      blocked = true;
      audio.muted = true;
      safePlay().catch(() => {}).finally(render); // Düşük Güç Modu vb. bunu da engelleyebilir
      render();
    });
  }

  // 2) İlk dokunuş: sesi aç. Mutlaka olayın içinde, senkron çağrılır (iOS şartı)
  function unlock() {
    if (muted) return;
    sfx.resume();
    audio.muted = false;
    audio.volume = 0;
    const wasPaused = audio.paused;
    const p = wasPaused ? safePlay() : Promise.resolve();
    p.then(() => {
      if (audio.muted || audio.paused) throw new Error('blocked');
      blocked = false;
      fadeTo(level(), wasPaused ? 2200 : 1200);
      detach();
      render();
    }).catch(() => { blocked = true; render(); });
  }

  // ================= Açılış: "zamanın geçişi" ses efekti (Web Audio, dosya yok) =================
  // main.js sinyal gönderir (uf:intro-count / -year / -arrive / -skip / -reveal / -done); sesler burada üretilir.
  const sfx = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return { resume() {}, ready: () => false };
    let ctx = null, master = null, verb = null, noise = null;

    function build() {
      if (ctx) return;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = null; return; }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = 0.002; comp.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = 0.42;
      master.connect(comp); comp.connect(ctx.destination);
      // Beyaz gürültü (tık ve uğultu için)
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // Kısa, yumuşak yankı (varış sesine derinlik)
      const len = Math.floor(ctx.sampleRate * 2.6);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      verb = ctx.createConvolver(); verb.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = 0.35;
      verb.connect(wet); wet.connect(master);
    }
    build();

    const ready = () => !!ctx && ctx.state === 'running' && !muted && !audio.muted;
    function resume() { build(); if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); }

    function env(g, t, peak, attack, decay) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }

    // 1) Saat / kilometre sayacı tıkı — yıl ilerledikçe tonu hafifçe yükselir
    let lastTick = 0;
    function tick(p) {
      if (!ready()) return;
      const t = ctx.currentTime + 0.004;
      if (t - lastTick < 0.03) return; // en hızlı anda tıklar birbirine karışmasın
      lastTick = t;
      const loud = 1.1 - 0.45 * p;   // hızlandıkça tek tık hafifler, toplam yoğunluk artar
      const src = ctx.createBufferSource(); src.buffer = noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000 + 1600 * p; bp.Q.value = 5;
      const g = ctx.createGain(); env(g, t, loud, 0.001, 0.028);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t, Math.random() * 0.9, 0.05);
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = 1150 * Math.pow(2, (5 * p) / 12);
      const og = ctx.createGain(); env(og, t, loud * 0.32, 0.001, 0.045);
      o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.06);
    }

    // 2) Sayaç boyunca kabaran uğultu (sayaçla aynı eğri: yavaş başlar, sonda hızlanır)
    let riser = null;
    function rise(dur) {
      if (!ready()) return;
      stopRise(0.05);
      const t = ctx.currentTime + 0.01, end = t + dur;
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(220, t); bp.frequency.exponentialRampToValueAtTime(2600, end);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, end);
      src.connect(bp); bp.connect(g); g.connect(master); src.start(t);
      const sub = ctx.createOscillator(); sub.type = 'sine';
      sub.frequency.setValueAtTime(46, t); sub.frequency.exponentialRampToValueAtTime(64, end);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.3, end);
      sub.connect(sg); sg.connect(master); sub.start(t);
      riser = { gains: [g, sg], srcs: [src, sub] };
    }
    function stopRise(fade) {
      if (!riser || !ctx) return;
      const t = ctx.currentTime;
      riser.gains.forEach((g) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t); g.gain.exponentialRampToValueAtTime(0.0001, t + fade); });
      riser.srcs.forEach((s) => { try { s.stop(t + fade + 0.05); } catch (e) {} });
      riser = null;
    }

    // 3) 2026'ya varış: kalın, yumuşak bir "bum" ve çan gibi parıltı — "bugüne geldik"
    function arrive(short) {
      stopRise(0.12);
      if (!ready()) return;
      const t = ctx.currentTime + 0.01, k = short ? 0.55 : 1;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(41, t + 0.55);
      const g = ctx.createGain(); env(g, t, 0.34 * k, 0.012, 1.7 * k);
      o.connect(g); g.connect(master); g.connect(verb); o.start(t); o.stop(t + 2);
      [1318.5, 1975.5, 2637].forEach((f, i) => {
        const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = f;
        const sg = ctx.createGain(); env(sg, t + 0.03 + i * 0.045, (0.07 - i * 0.015) * k, 0.012, 2.8 * k);
        s.connect(sg); sg.connect(master); sg.connect(verb); s.start(t); s.stop(t + 3.4);
      });
    }

    let skipped = false;
    addEventListener('uf:intro-count', (e) => { if (!skipped) rise((e.detail && e.detail.duration) || 2.6); });
    addEventListener('uf:intro-year', (e) => { if (!skipped && e.detail) tick(e.detail.p); });
    addEventListener('uf:intro-arrive', () => arrive(skipped));
    addEventListener('uf:intro-skip', () => { skipped = true; stopRise(0.15); });
    return { resume, ready };
  })();

  // Açılış bitince (perdeler kalkarken) müzik asıl seviyesine yükselir
  function endIntro() {
    if (!introActive) return;
    introActive = false;
    if (audible()) fadeTo(level(), 2600);
  }
  addEventListener('uf:intro-reveal', endIntro);
  addEventListener('uf:intro-done', endIntro);
  setTimeout(endIntro, 12000); // emniyet: açılış hiç sinyal vermezse

  // Yalnızca tarayıcının "kullanıcı etkileşimi" saydığı olaylar (pointerdown/touchstart sayılmaz)
  const GESTURES = ['touchend', 'click', 'keydown'];
  function onGesture(e) {
    if (btn && btn.contains(e.target)) return; // düğme kendi işini yapar
    if (!muted && blocked) unlock();
  }
  function attach() { GESTURES.forEach((g) => document.addEventListener(g, onGesture, { capture: true, passive: true })); }
  function detach() { GESTURES.forEach((g) => document.removeEventListener(g, onGesture, { capture: true })); }

  attach();
  autostart();
  render();

  if (btn) {
    btn.addEventListener('click', () => {
      if (audible()) {
        muted = true;
        try { sessionStorage.setItem(KEY, 'kapali'); } catch (e) {}
        fadeTo(0, 400);
        setTimeout(() => { if (muted) audio.pause(); render(); }, 420); // rAF arka planda durabilir
        render();
      } else {
        muted = false;
        try { sessionStorage.removeItem(KEY); } catch (e) {}
        blocked = true; // bu tıklama zaten bir dokunuş: hemen aç
        unlock();
      }
    });
  }

  // Sekme arka plana alınınca sustur, geri gelince kaldığı yerden sürdür
  let resumeOnShow = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resumeOnShow = !audio.paused;
      if (resumeOnShow) audio.pause();
    } else if (resumeOnShow && !muted) {
      audio.play().catch(() => {});
    }
  });

  audio.addEventListener('play', render);
  audio.addEventListener('pause', render);
  audio.addEventListener('volumechange', render);
})();
