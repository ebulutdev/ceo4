/* Arka plan müziği — sahne animasyonlarından tamamen bağımsız çalışır.
   Sayfa açılır açılmaz çalmayı dener; tarayıcı sesli otomatik oynatmayı engellerse
   ziyaretçinin ilk dokunuşu / tıklaması / tuşu ile başlar. Ses düğmesi tercihi hatırlanır. */
(() => {
  const btn = document.querySelector('.sound');
  const audio = new Audio('assets/audio/fon-muzik-v3.mp3');
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;

  const TARGET = 0.45;
  const KEY = 'uf-ses';
  let muted = false;
  try { muted = localStorage.getItem(KEY) === 'kapali'; } catch (e) {}

  let fadeRaf = 0;
  function fadeTo(v, ms, done) {
    cancelAnimationFrame(fadeRaf);
    const from = audio.volume, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (v - from) * k));
      if (k < 1) fadeRaf = requestAnimationFrame(step);
      else if (done) done();
    };
    fadeRaf = requestAnimationFrame(step);
  }

  function render() {
    if (!btn) return;
    const on = !muted && !audio.paused;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Müziği kapat' : 'Müziği aç');
    const label = btn.querySelector('.sound__label');
    if (label) label.textContent = on ? 'Ses Açık' : 'Ses Kapalı';
  }

  function play() {
    if (muted) return Promise.resolve(false);
    const p = audio.play();
    render(); // yüklenirken de düğme "açık" görünsün; tıklama doğru yöne çalışsın
    return (p && p.then ? p : Promise.resolve()).then(() => {
      fadeTo(TARGET, 2200);
      render();
      return true;
    }).catch(() => { render(); return false; });
  }

  // Otomatik oynatma engellenirse ilk etkileşimde başlat
  const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'];
  function onGesture(e) {
    if (btn && btn.contains(e.target)) return; // düğme kendi işini yapar
    play().then((ok) => { if (ok || muted) detach(); });
  }
  function attach() { GESTURES.forEach((g) => addEventListener(g, onGesture, { capture: true, passive: true })); }
  function detach() { GESTURES.forEach((g) => removeEventListener(g, onGesture, { capture: true })); }

  if (!muted) {
    attach();
    play().then((ok) => { if (ok) detach(); });
  }
  render();

  if (btn) {
    btn.addEventListener('click', () => {
      if (!muted && !audio.paused) {
        muted = true;
        try { localStorage.setItem(KEY, 'kapali'); } catch (e) {}
        fadeTo(0, 450);
        setTimeout(() => { if (muted) audio.pause(); render(); }, 480); // rAF arka planda durabilir
        render();
      } else {
        muted = false;
        try { localStorage.setItem(KEY, 'acik'); } catch (e) {}
        detach();
        play();
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
})();
