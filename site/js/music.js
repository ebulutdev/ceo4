/* Arka plan müziği — sahne animasyonlarından tamamen bağımsız çalışır.
   Varsayılan: SES AÇIK. Sayfa açılır açılmaz sesli çalmayı dener.
   Tarayıcılar (iPhone Safari, mobil Chrome) sesli otomatik oynatmayı ziyaretçi bir yere
   DOKUNANA kadar engeller (kaydırma dokunuş sayılmaz). Bu durumda müzik sessiz olarak
   hemen başlar ve ilk dokunuş / tıklama / tuşta kaldığı yerden sesli devam eder.
   Kapatma tercihi yalnızca o ziyaret boyunca geçerlidir; her yeni ziyarette ses açık gelir. */
(() => {
  const btn = document.querySelector('.sound');
  // Müzik dosyası, açılış videosu oynamaya hazır olana kadar indirilmez (mobilde bant genişliği önce videoya);
  // en geç 2,5 sn sonra ya da ilk dokunuşta başlar. Açılışta müzik zaten kısık olduğundan fark edilmez.
  const SRC = 'assets/audio/fon-muzik-v3.mp3';
  const audio = new Audio();
  audio.loop = true;
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  const ensureSrc = () => { if (!audio.getAttribute('src')) audio.src = SRC; };

  const TARGET = 0.45; // iOS ses düzeyini sayfaya bırakmaz; orada cihaz sesi geçerlidir
  const INTRO_LEVEL = 0.1; // açılıştaki zaman efekti sırasında müzik geride kalır
  let introActive = !!document.querySelector('.intro');
  const level = () => (introActive ? INTRO_LEVEL : TARGET);
  const KEY = 'uf-ses';
  let muted = false;
  // Her sayfa açılışında ses AÇIK başlar; kapatma yalnızca o görüntülemede geçerlidir
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {} // eski kayıtları temizle

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
    ensureSrc();
    try { return Promise.resolve(audio.play()); } catch (e) { return Promise.reject(e); }
  };

  // 1) Sayfa açılışı: önce sesli dene; olmazsa sessiz başlat (her tarayıcı buna izin verir)
  function autostart() {
    if (muted || (!audio.paused && !audio.muted)) return; // ilk dokunuşla zaten başladıysa
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
    }
    // Kısa, yumuşak yankı (varış sesine derinlik). Ağır iş (yankı tamponu + FFT hazırlığı) açılışı
    // bekletmesin diye tarayıcı boştayken, küçük boyutta ve Math.pow olmadan üretilir.
    function buildVerb() {
      if (verb || !ctx) return;
      const len = Math.floor(ctx.sampleRate * 1.3);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      const k = Math.pow(0.001, 1 / len); // ~ -60 dB'e üstel sönüm
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        let a = 1;
        for (let i = 0; i < len; i++) { ch[i] = (Math.random() * 2 - 1) * a; a *= k; }
      }
      const cv = ctx.createConvolver(); cv.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = 0.4;
      cv.connect(wet); wet.connect(master);
      verb = cv;
    }
    build();
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));
    idle(buildVerb, { timeout: 1500 });

    const ready = () => !!ctx && ctx.state === 'running' && !muted && !audio.muted;
    function resume() { build(); if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); }

    function env(g, t, peak, attack, decay) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }

    // 1) Antika sarkaçlı saat: "tik" / "tak" — kısa metal çarpma + ahşap gövde tınısı (perde yükselmez)
    let lastTick = 0;
    function tick(p, year) {
      if (!ready()) return;
      const t = ctx.currentTime + 0.004;
      if (t - lastTick < 0.03) return; // en hızlı anda tıklar birbirine karışmasın
      lastTick = t;
      const tock = year % 2 === 1;                 // sırayla tik / tak
      const loud = 1.0 - 0.4 * p;                  // hızlandıkça tek tık hafifler
      // a) Metal çarpma (çok kısa, kuru)
      const src = ctx.createBufferSource(); src.buffer = noise;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
      const g = ctx.createGain(); env(g, t, loud * 0.55, 0.0008, 0.007);
      src.connect(hp); hp.connect(g); g.connect(master);
      // b) Çark / maşa tınısı: dar bantta kısa çınlama (tik ince, tak kalın)
      const ring = ctx.createBiquadFilter(); ring.type = 'bandpass'; ring.frequency.value = tock ? 1780 : 2320; ring.Q.value = 16;
      const rg = ctx.createGain(); env(rg, t, loud * 2.2, 0.001, 0.05);
      src.connect(ring); ring.connect(rg); rg.connect(master); if (verb) rg.connect(verb);
      src.start(t, Math.random() * 0.9, 0.08);
      // c) Ahşap kasa: yumuşak, tok gövde sesi
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = tock ? 168 : 205;
      const og = ctx.createGain(); env(og, t, loud * 0.3, 0.002, 0.045);
      o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.08);
    }

    // 2) Sayaç boyunca alttan gelen koyu, kısık "zaman" uğultusu (tıkları örtmez)
    let riser = null;
    function rise(dur) {
      if (!ready()) return;
      stopRise(0.05);
      const t = ctx.currentTime + 0.01, end = t + dur;
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(320, t); lp.frequency.exponentialRampToValueAtTime(1100, end);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, end);
      src.connect(lp); lp.connect(g); g.connect(master); src.start(t);
      const sub = ctx.createOscillator(); sub.type = 'sine';
      sub.frequency.setValueAtTime(49, t); sub.frequency.exponentialRampToValueAtTime(55, end);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.22, end);
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

    // 3) 2026'ya varış: saat kulesi çanının tek, derin vuruşu — "bugüne geldik"
    //    Gerçek çan kısmi oranları (hum, prime, minör terz, kuint, nominal ...), her biri kendi sönümüyle
    function arrive(short) {
      stopRise(0.12);
      if (!ready()) return;
      const t = ctx.currentTime + 0.01, k = short ? 0.5 : 1;
      const f0 = 146.83; // D3 — derin kule çanı
      const P = [
        [0.5, 0.30, 7.0], [1.0, 0.26, 5.0], [1.003, 0.10, 5.0], [1.19, 0.16, 3.9],
        [1.5, 0.08, 3.1], [2.0, 0.17, 3.6], [2.006, 0.06, 3.6], [2.74, 0.05, 2.1],
        [3.0, 0.06, 1.8], [4.07, 0.03, 1.3],
      ];
      P.forEach(([r, a, dcy]) => {
        const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = f0 * r;
        const sg = ctx.createGain(); env(sg, t, a * k, 0.004, dcy * k);
        s.connect(sg); sg.connect(master); if (verb) sg.connect(verb);
        s.start(t); s.stop(t + dcy * k + 0.1);
      });
      // Tokmak darbesi (vuruşun ilk anı)
      const n = ctx.createBufferSource(); n.buffer = noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 1.2;
      const ng = ctx.createGain(); env(ng, t, 0.2 * k, 0.001, 0.03);
      n.connect(bp); bp.connect(ng); ng.connect(master); n.start(t, Math.random() * 0.9, 0.06);
    }

    // ---------- Sahne efektleri: hafif, müziğin altında kalır ----------
    let ui = null, voice = null;
    function busRoot() {
      if (!ui) { ui = ctx.createGain(); ui.gain.value = 1.6; ui.connect(master); }
      return ui;
    }
    // Her efekt kendi "ses kanalına" (voice) bağlanır; böylece gerektiğinde tek hamlede susturulabilir
    const bus = () => voice || busRoot();
    // Yumuşak hava geçişi (fotoğraf / söz / menü değişimi)
    function whoosh(dir, amt, lo, hi, dur) {
      const t = ctx.currentTime + 0.005;
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
      const a = dir > 0 ? lo : hi, b = dir > 0 ? hi : lo;
      bp.frequency.setValueAtTime(a, t); bp.frequency.exponentialRampToValueAtTime(b, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amt, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(bus());
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    }
    // Yumuşak nota (ahşap / çan gibi, kısa)
    function note(freq, amt, decay, wet) {
      const t = ctx.currentTime + 0.005;
      [[1, 1], [2, 0.28], [3.01, 0.08]].forEach(([m, v]) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m;
        const g = ctx.createGain(); env(g, t, amt * v, 0.006, decay / m);
        o.connect(g); g.connect(bus()); if (wet && verb) g.connect(verb);
        o.start(t); o.stop(t + decay + 0.1);
      });
    }
    // Kısa kalem / ahşap tıkı
    function tap(freq, amt) {
      const t = ctx.currentTime + 0.005;
      const src = ctx.createBufferSource(); src.buffer = noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * 2.4; bp.Q.value = 6;
      const g = ctx.createGain(); env(g, t, amt, 0.001, 0.025);
      src.connect(bp); bp.connect(g); g.connect(bus()); src.start(t, Math.random() * 0.9, 0.04);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
      const og = ctx.createGain(); env(og, t, amt * 0.5, 0.001, 0.07);
      o.connect(og); og.connect(bus()); o.start(t); o.stop(t + 0.1);
    }
    // Rakam sayacı: sayacın yavaşlayan eğrisine (power3.out) uyan, azalan tıklar
    function roll(dur) {
      const N = 9, t0 = ctx.currentTime + 0.01;
      for (let k = 1; k <= N; k++) {
        const x = 1 - Math.pow(1 - k / N, 1 / 3);
        const t = t0 + x * dur;
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1500 - k * 40;
        const g = ctx.createGain(); env(g, t, 0.06 * (1 - k / (N + 3)), 0.001, 0.035);
        o.connect(g); g.connect(bus()); o.start(t); o.stop(t + 0.06);
      }
    }
    const PENTA = [392, 440, 523.25, 587.33, 659.25, 783.99]; // G4 A4 C5 D5 E5 G5 — uyumlu, kulağı yormaz
    const CITY = [98, 110, 130.81, 146.83, 164.81];           // gökdelen katları: alttan yukarı
    const last = {};
    const SCENE = {
      story: (d) => { whoosh(d.dir, 0.11, 380, 1700, 0.55); note(d.dir > 0 ? 110 : 98, 0.05, 0.5); },
      lead: (d) => note(PENTA[Math.min(PENTA.length - 1, d.i + 1)] * (d.dir > 0 ? 1 : 0.89), 0.05, 0.7, true),
      quote: (d) => whoosh(d.dir, 0.13, 300, 1200, 0.8),
      city: (d) => { note(CITY[Math.min(CITY.length - 1, d.i)], 0.06, 1.6, true); },
      card: (d) => tap(d.dir > 0 ? 760 : 680, 0.06),
      count: (d) => roll(d.duration || 1.35),
      mark: () => tap(880, 0.05),
      menu: (d) => whoosh(d.dir, 0.13, 260, 1400, 0.4),
    };
    // Hızlı ileri-geri kaydırmada bozulmayı önleyen kurallar:
    //  - aynı türden sesler arasında en az GAP saniye
    //  - kısa sürede yön değiştiren (titreyen) tetiklemeler yok sayılır
    //  - aynı türden yeni ses gelince önceki yumuşakça susturulur (üst üste yığılmaz)
    //  - aynı anda en fazla MAX_VOICES efekt çalar
    const GAP = { count: 0.35, city: 0.22, story: 0.22, lead: 0.2, quote: 0.25, card: 0.12, mark: 0.1, menu: 0.15 };
    const FLIP = 0.9, MAX_VOICES = 3, VOICE_LIFE = 1.6;
    const lastDir = {}, voices = {}, live = [];
    addEventListener('uf:sfx', (e) => {
      const d = e.detail || {};
      const fn = SCENE[d.type];
      if (!fn || !ready() || introActive) return;
      const now = ctx.currentTime;
      const prev = last[d.type] == null ? -9 : last[d.type];
      if (now - prev < (GAP[d.type] || 0.09)) return;
      if (d.dir && lastDir[d.type] && d.dir !== lastDir[d.type] && now - prev < FLIP) return;
      for (let i = live.length - 1; i >= 0; i--) if (live[i] < now) live.splice(i, 1);
      if (live.length >= MAX_VOICES) return;
      last[d.type] = now; lastDir[d.type] = d.dir || 0;
      const old = voices[d.type];
      if (old) { old.gain.cancelScheduledValues(now); old.gain.setValueAtTime(old.gain.value, now); old.gain.setTargetAtTime(0, now, 0.03); }
      const v = ctx.createGain(); v.connect(busRoot());
      voices[d.type] = v; voice = v;
      try { fn(d); } catch (err) {} finally { voice = null; }
      live.push(now + VOICE_LIFE);
    });

    let skipped = false;
    addEventListener('uf:intro-count', (e) => { if (!skipped) rise((e.detail && e.detail.duration) || 2.6); });
    addEventListener('uf:intro-year', (e) => { if (!skipped && e.detail) tick(e.detail.p, e.detail.year); });
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
  render();
  // Müziği video hazır olunca (ya da en geç 2,5 sn sonra) başlat
  (() => {
    let started = false;
    const go = () => { if (started) return; started = true; autostart(); };
    const v = document.querySelector('.film__video');
    if (!v || v.readyState >= 3) { go(); return; }
    v.addEventListener('canplaythrough', go, { once: true });
    setTimeout(go, 2500);
  })();

  if (btn) {
    btn.addEventListener('click', () => {
      if (audible()) {
        muted = true;
        fadeTo(0, 400);
        setTimeout(() => { if (muted) audio.pause(); render(); }, 420); // rAF arka planda durabilir
        render();
      } else {
        muted = false;
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
