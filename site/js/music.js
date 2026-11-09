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
    audio.muted = false;
    audio.volume = 0;
    safePlay().then(() => {
      blocked = false;
      fadeTo(TARGET, 2200);
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
    audio.muted = false;
    audio.volume = 0;
    const wasPaused = audio.paused;
    const p = wasPaused ? safePlay() : Promise.resolve();
    p.then(() => {
      if (audio.muted || audio.paused) throw new Error('blocked');
      blocked = false;
      fadeTo(TARGET, wasPaused ? 2200 : 1200);
      detach();
      render();
    }).catch(() => { blocked = true; render(); });
  }

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
