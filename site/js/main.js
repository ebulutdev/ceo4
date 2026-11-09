/* Ümit Fettahoğlu — sahne koreografisi.
   Tek hikâye: açılış → film → manifesto → hikâye → liderlik → kent (3D) → rakamlar
   → tarihçe → imza siteler → sözler → grup → iletişim.
   Kural: aynı anda tek şey hareket eder; mobilde aynı hikâye, daha hafif ve kesintisiz. */
(() => {
  'use strict';

  const d = document;
  const html = d.documentElement;
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => Array.from(c.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const isDesk = () => innerWidth >= 1024;
  const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  const fmt = (n) => Math.round(n).toLocaleString('tr-TR');

  let lenis = null;
  let menuOpen = false;
  let warmCity = null;

  const intro = $('.intro');

  // ---------- Hareketsiz mod (reduced motion / kütüphane yok) ----------
  if (!hasGsap || reduce) {
    html.classList.add('no-motion');
    if (intro) intro.classList.add('is-done');
    $$('.city__word, .city__desc-item').forEach((el) => {
      el.style.transform = 'none'; el.style.opacity = '0';
    });
    const lastWord = $$('.city__word').pop(); if (lastWord) lastWord.style.opacity = '1';
    const lastDesc = $$('.city__desc-item').pop(); if (lastDesc) lastDesc.style.opacity = '1';
    $('.city').classList.add('is-fallback');
    $$('.project__art').forEach((art) => {
      if ($('.project__img', art)) return;
      art.insertAdjacentHTML('beforeend', `<div class="project__bp">${blueprintSVG(+art.dataset.blocks || 1, +art.dataset.floors || 8, (art.dataset.labels || '').split(',').filter(Boolean))}</div>`);
    });
    initMenu(); initForm(); initAnchors();
    return;
  }

  html.classList.add('motion', 'intro-lock');
  // Açılış her zaman en üstten başlasın
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  gsap.defaults({ ease: 'expo.out', duration: 1.2 });

  // ---------- Tamamlanan sahneler katlanır ----------
  // Bir sahne bitene kadar normal davranır (yarıda geri dönülürse geri sarılır, ölü kaydırma olmaz).
  // Aşağı doğru tamamlanınca son hâlinde kilitlenir; kaydırma durduğunda sabitleme (pin) mesafesi sayfadan
  // silinir ve kaydırma konumu aynı miktarda düzeltilir — ekranda zıplama olmaz, yukarı çıkarken
  // sahne tek ekran boyunda akıp geçer. Sayfa yenilenince tüm sahneler baştan oynar.
  const collapseQ = new Set();
  // Katlama sırasında sayfa önce kısalır, sonra kaydırma konumu düzeltilir. Bu ara anda sonraki sahneler
  // kendini yanlışlıkla 'geçilmiş' sanmasın diye tüm sahne olayları yok sayılır (zincirleme atlama hatası).
  let collapsing = false;
  let collapseScheduled = false;
  const sceneChecks = []; // katlamadan sonra 'sonu geçilmiş ama bitmemiş' sahneleri tamamlar
  function queueCollapse(st) {
    st._done = true;
    collapseQ.add(st);
    if (!collapseScheduled) {
      collapseScheduled = true;
      queueMicrotask(() => {
        collapseScheduled = false;
        runCollapse();
      });
    }
  }
  function runCollapse() {
    if (collapsing || !collapseQ.size) return;
    const list = [...collapseQ].filter((st) => st.progress >= 1 || st._done);
    if (!list.length) return;
    collapsing = true;
    const y0 = lenis ? lenis.animatedScroll : scrollY;
    let removed = 0;
    for (const st of list) {
      collapseQ.delete(st);
      const span = Math.max(0, st.end - st.start);
      const consumed = Math.max(0, Math.min(y0 - st.start, span));
      removed += consumed;
      st.kill(true);
    }
    const y = Math.max(0, y0 - removed);
    if (lenis) {
      lenis.dimensions.resize();
      const targetY = Math.max(0, Math.min(lenis.limit, lenis.targetScroll - removed));
      lenis.animatedScroll = y;
      lenis.targetScroll = targetY;
      if (lenis.animate && lenis.animate.isRunning) {
        lenis.animate.value = y;
        lenis.animate.from = Math.max(0, lenis.animate.from - removed);
        lenis.animate.to = targetY;
      }
      lenis.setScroll(y);
      lenis.preventNextNativeScrollEvent();
    }
    scrollTo(0, y);
    ScrollTrigger.refresh();
    // Konum düzeltildikten sonra sahneler doğru ilerleme değerleriyle yeniden olay almaya başlar
    requestAnimationFrame(() => {
      collapsing = false;
      ScrollTrigger.update();
      sceneChecks.forEach((fn) => fn());
    });
  }

  function fwd(anim, vars) {
    const { scrub = true, autoSpeed = 0, canAuto = null, ...rest } = vars;
    let curP = 0, maxP = 0, lastScrollP = 0, lastTick = gsap.ticker.time;
    anim.pause();
    let done = false;
    const lag = scrub === true ? 0 : scrub;
    const go = (p) => {
      if (!lag) anim.progress(p);
      else gsap.to(anim, { progress: p, duration: lag, ease: 'power1.out', overwrite: true });
    };
    function completeScene(self) {
      if (done) return;
      done = true;
      st._done = true;
      if (autoSpeed > 0) gsap.ticker.remove(tickAuto);
      go(1);
      if (rest.onLeave) rest.onLeave(self);
      if (self.pin) queueCollapse(self);
    }
    const st = ScrollTrigger.create({
      ...rest,
      onUpdate(self) {
        if (!done && !collapsing) {
          maxP = Math.max(maxP, self.progress);
          if (autoSpeed > 0) {
            const dp = self.progress - lastScrollP;
            lastScrollP = self.progress;
            if (dp > 0) {
              curP = Math.min(1, Math.max(curP + dp, self.progress));
              go(curP);
              if (curP >= 1) finishAuto();
            }
          } else if (self.pin && maxP >= 0.88 && self.direction === -1) {
            completeScene(self);
          } else {
            go(self.progress);
          }
        }
        if (rest.onUpdate) rest.onUpdate(self);
      },
      onLeave(self) {
        if (collapsing) return;
        completeScene(self);
      },
      onRefresh(self) {
        if (rest.invalidateOnRefresh) { const p = anim.progress(); anim.invalidate().progress(0).progress(p); }
        if (rest.onRefresh) rest.onRefresh(self);
      },
    });
    sceneChecks.push(() => {
      if (done || (!st.isActive && st.progress < 1)) return;
      if (st.progress >= 1) completeScene(st);
    });
    function finishAuto() {
      if (done) return;
      curP = 1;
      completeScene(st);
    }
    function tickAuto(time) {
      const dt = Math.min(0.06, Math.max(0, time - lastTick));
      lastTick = time;
      if (done || collapsing || menuOpen || html.classList.contains('intro-lock') || (canAuto && !canAuto())) return;
      curP = Math.min(1, curP + dt * autoSpeed);
      go(curP);
      if (curP >= 1) finishAuto();
    }
    if (autoSpeed > 0) gsap.ticker.add(tickAuto);
    return st;
  }

  // ---------- Lenis ----------
  lenis = new Lenis({ lerp: 0.13, smoothWheel: true, syncTouch: false });
  lenis.stop();
  lenis.on('scroll', ScrollTrigger.update);
  ScrollTrigger.addEventListener('scrollEnd', runCollapse);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  // ---------- Metin bölme yardımcıları ----------
  function splitWords(el) {
    const s = new SplitType(el, { types: 'words', tagName: 'span' });
    s.words.forEach((w) => { w.innerHTML = `<span class="wi">${w.innerHTML}</span>`; });
    return $$('.wi', el);
  }

  const header = $('[data-header]');
  const progressBar = $('.progress__bar');
  const progressNum = $('.progress__num');
  const cursor = $('.cursor');

  // ---------- Açılış ----------
  gsap.set('.film__cue', { autoAlpha: 0 });
  gsap.set(header, { autoAlpha: 0 });
  let introDone = false;

  function runIntro() {
    let seen = false;
    try { seen = sessionStorage.getItem('uf-intro') === '1'; sessionStorage.setItem('uf-intro', '1'); } catch (e) { /* gizli mod */ }
    scrollTo(0, 0);
    lenis.stop();
    const k = 1; // sayfa her yenilendiğinde açılış tam oynar
    let unlocked = false;
    const strips = $$('.intro__strip');
    const yr = { v: 1956 };
    // Kilometre sayacı: birler sürekli kayar; üst basamaklar alt basamak 9→0 geçerken birlikte döner
    function setYear(v) {
      [1000, 100, 10, 1].forEach((p, i) => {
        const whole = Math.floor(v / p);
        let pos = whole % 10;
        if (p === 1) pos = v % 10;
        else { const below = v - whole * p; if (below > p - 1) pos += below - (p - 1); }
        strips[i].style.transform = 'translate3d(0,' + (-pos).toFixed(4) + 'em,0)';
      });
    }
    setYear(1956);

    function unlockScroll() {
      if (unlocked) return;
      unlocked = true;
      intro.style.pointerEvents = 'none';
      html.classList.remove('intro-lock');
      lenis.start();
    }

    // Sayfa (hero görseli + fontlar) hazır olana kadar sayaç sonunda kısa bekleme; en fazla 3.5 sn
    let pageReady = d.readyState === 'complete';
    const onReady = () => { pageReady = true; if (tl.paused() && waiting) { waiting = false; tl.resume(); } };
    if (!pageReady) { addEventListener('load', onReady, { once: true }); setTimeout(onReady, 3500); }
    let waiting = false;

    const tl = gsap.timeline({ onComplete: finish });
    // Yalnızca transform / opacity / kısa süreli blur: ölçek (büyüme) animasyonu yok.
    tl.fromTo('.intro__label', { autoAlpha: 0, letterSpacing: '.72em' }, { autoAlpha: 1, letterSpacing: '.46em', duration: 1.1 * k, ease: 'expo.out' }, 0.05)
      .fromTo('.intro__count', { autoAlpha: 0, y: 14, filter: 'blur(10px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.9 * k, ease: 'power3.out', clearProps: 'filter' }, 0.12)
      // 1956 → 2026: yavaş başlar, giderek hızlanır; çubuk ve ışık noktası aynı eğriyle ilerler
      .addLabel('count', 0.45 * k)
      .to(yr, { v: 2026, duration: 2.6 * k, ease: 'power3.in', onUpdate: () => setYear(yr.v) }, 'count')
      .to('.intro__fill', { scaleX: 1, duration: 2.6 * k, ease: 'power3.in' }, 'count')
      .fromTo('.intro__spark', { x: 0 }, { x: () => $('.intro__track').offsetWidth, duration: 2.6 * k, ease: 'power3.in' }, 'count')
      .to('.intro__spark', { autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, '>')
      .addPause('>-0.3', () => { if (pageReady) requestAnimationFrame(() => tl.resume()); else waiting = true; })
      // Sayaç 2026'da kalır; çubuk söner, altında çizgi soldan sağa günümüze uzanır ve söz belirir (çakışma yok)
      .to('.intro__bar', { autoAlpha: 0, y: -6, duration: 0.6 * k, ease: 'power2.inOut' }, '+=0.15')
      .to('.intro__line', { scaleX: 1, duration: 1.3 * k, ease: 'expo.inOut' }, '-=0.25')
      .fromTo('.intro__quote',
        { autoAlpha: 0, y: 8, filter: 'blur(8px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1.2 * k, ease: 'power3.out' }, '-=0.75')
      // Siteye geçiş: içerik yumuşakça dağılır, perdeler kademeli olarak yukarı kalkar
      .to(['.intro__content', '.intro__skip'], { autoAlpha: 0, y: -10, duration: 0.65, ease: 'power2.in' }, `+=${0.6 * k}`)
      .to('.intro__panel--l', { yPercent: -101, duration: 1.05, ease: 'expo.inOut', force3D: true }, '-=0.18')
      .to('.intro__panel--r', { yPercent: -101, duration: 1.05, ease: 'expo.inOut', force3D: true }, '<0.09')
      .add(unlockScroll, '<0.3')
      .to('.film__cue', { autoAlpha: 1, duration: 0.6, ease: 'power2.out' }, '<0.2')
      .to(header, { autoAlpha: 1, duration: 0.6, ease: 'power2.out' }, '<');

    let skipped = false;
    const skip = () => {
      if (skipped) return;
      skipped = true;
      tl.timeScale(3.8);
      if (tl.paused()) { waiting = false; tl.resume(); }
      unlockScroll();
    };
    $('.intro__skip').addEventListener('click', skip, { once: true });
    intro.addEventListener('click', skip, { once: true });
    addEventListener('keydown', skip, { once: true });
    addEventListener('wheel', skip, { once: true, passive: true });
    addEventListener('touchmove', skip, { once: true, passive: true });

    function finish() {
      introDone = true;
      unlockScroll();
      intro.classList.add('is-done');
    }
  }

  const fontList = ['500 1em "Cormorant Garamond"', 'italic 500 1em "Cormorant Garamond"', '400 1em Jost', '500 1em Jost'];
  const fontsReady = d.fonts ? Promise.race([Promise.all(fontList.map((f) => d.fonts.load(f))), new Promise((r) => setTimeout(r, 350))]) : Promise.resolve();
  fontsReady.then(() => {
    ScrollTrigger.refresh();
    requestAnimationFrame(() => requestAnimationFrame(runIntro));
  });

  // ======================================================================
  // 1. ÖNCE TÜM SABİTLENEN (PIN) SAHNELER OLUŞTURULUR (DOM SIRASIYLA)
  // ======================================================================

  // ---------- 00 · Film: kaydırdıkça binadan salona girilir, sonunda isim belirir ve sabit kalır ----------
  initFilm();

  function initFilm() {
    const sec = $('.film');
    const video = $('.film__video', sec);
    if (video) {
      const isMob = innerWidth < 768;
      const BASE_RATE = 0.78;
      let targetP = 0, lastScrollP = 0, filmDone = false;
      video.src = isMob ? 'assets/film/hero-m.mp4' : 'assets/film/hero-d.mp4';
      video.muted = true;
      video.playsInline = true;
      video.defaultPlaybackRate = BASE_RATE;
      video.playbackRate = BASE_RATE;
      const markReady = () => { if (!sec.classList.contains('is-ready')) sec.classList.add('is-ready'); };
      video.addEventListener('loadeddata', markReady, { once: true });
      video.addEventListener('canplay', markReady, { once: true });
      video.load();

      const lines = $$('.film__name .mask > span', sec);
      const meta = [$('.film__eyebrow', sec), $('.film__role', sec)];
      gsap.set(lines, { yPercent: 150 });
      gsap.set(meta, { autoAlpha: 0, y: 14 });
      gsap.set('.film__title', { autoAlpha: 0 });

      const filmTl = gsap.timeline({ paused: true, defaults: { ease: 'none', immediateRender: false } })
        .fromTo('.film__cue', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.12, immediateRender: false }, 0.16)
        .fromTo('.film__shade', { opacity: 0 }, { opacity: 1, duration: 0.28 }, 0.54)
        .fromTo('.film__title', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.02, immediateRender: false }, 0.58)
        .fromTo(lines, { yPercent: 150 }, { yPercent: 0, duration: 0.24, stagger: 0.04, ease: 'power3.out' }, 0.59)
        .fromTo(meta, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.18, stagger: 0.04, ease: 'power2.out' }, 0.68)
        .to({}, { duration: 0.14 });

      const filmSt = ScrollTrigger.create({
        trigger: sec,
        start: 'top top',
        end: () => (isDesk() ? '+=200%' : '+=165%'),
        pin: '.film__pin',
        invalidateOnRefresh: true,
        onUpdate(self) {
          if (filmDone || collapsing) return;
          const dp = self.progress - lastScrollP;
          lastScrollP = self.progress;
          const dur = video.duration || 5.8;
          const vP = Math.min(1, video.currentTime / Math.max(0.1, dur - 0.04));
          if (dp > 0) {
            targetP = Math.min(1, Math.max(targetP, vP, self.progress) + dp * 1.15);
            if (self.progress > vP + 0.08 && dur > 0.2) {
              try { video.currentTime = Math.min(dur - 0.04, self.progress * (dur - 0.04)); } catch (e) {}
            }
            if (targetP >= 0.995 && self.progress >= 0.96) finishVideoFilm();
          } else if (dp < 0 && self.direction === -1) {
            if (vP >= 0.72 || targetP >= 0.78) {
              finishVideoFilm();
            } else if (lenis && lenis.animatedScroll > 0) {
              lastScrollP = 0;
              lenis.animatedScroll = 0;
              lenis.targetScroll = 0;
              if (lenis.animate) lenis.animate.stop();
              lenis.setScroll(0);
              scrollTo(0, 0);
            }
          }
        },
        onLeave() {
          if (!collapsing) finishVideoFilm();
        },
      });

      function finishVideoFilm() {
        if (filmDone) return;
        filmDone = true;
        gsap.ticker.remove(tickVideoFilm);
        const dur = video.duration || 5.8;
        try { video.pause(); if (dur > 0.2) video.currentTime = dur - 0.03; } catch (e) {}
        filmTl.progress(1);
        if (warmCity) warmCity();
        queueCollapse(filmSt);
      }

      function tickVideoFilm() {
        if (filmDone || collapsing || html.classList.contains('intro-lock')) return;
        if (menuOpen) {
          if (!video.paused) video.pause();
          return;
        }
        const dur = video.duration || 5.8;
        const vP = dur > 0.2 ? Math.min(1, video.currentTime / (dur - 0.04)) : 0;
        targetP = Math.max(targetP, vP);
        const diff = Math.max(0, targetP - vP);
        const desiredRate = Math.min(3.8, BASE_RATE + diff * 14);
        if (Math.abs(video.playbackRate - desiredRate) > 0.04) {
          video.playbackRate = desiredRate;
        }
        if (video.paused && vP < 0.995) {
          video.play().catch(() => {});
        }
        filmTl.progress(vP);
        if (video.ended || vP >= 0.995) {
          finishVideoFilm();
        }
      }

      gsap.ticker.add(tickVideoFilm);
      video.addEventListener('ended', finishVideoFilm, { once: true });
      return;
    }
    const canvas = $('.film__canvas', sec);
    const posterImg = $('.film__poster img', sec);
    // 1. Opak ve düşük gecikmeli 2D bağlamı (alfa harmanlama maliyetini sıfırlar)
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
    const isMob = innerWidth < 768;
    const cfg = isMob
      ? { dir: 'm', n: 90, startF: 4, maxW: 720, maxH: 960 }
      : { dir: 'd', n: 120, startF: 6, maxW: 1920, maxH: 1080 };

    // İki katmanlı bellek:
    // Katman 1: Sıkıştırılmış WebP Blob dizisi (~8.3 MB RAM, ömür boyu kalıcı)
    // Katman 2: Kaydırma yönlü asimetrik ImageBitmap penceresi (+24 ileri, -10 geri; resizeWidth olmadan ~1.5 ms Worker decode)
    const WIN_AHEAD = isMob ? 24 : 38;
    const WIN_BEHIND = isMob ? 6 : 10;
    const MAX_DECODE = 6;

    const blobs = new Array(cfg.n).fill(null);
    const bitmaps = new Map();
    const decoding = new Set();
    const fetching = new Set();
    const src = (i) => `assets/film/${cfg.dir}/${String(i + 1).padStart(3, '0')}.webp`;

    let want = cfg.startF, wantPos = cfg.startF, drawnPos = -1, stallFrames = 0;
    let drawn = -1;
    let scrollDir = 1;
    let rafId = 0;

    // 2. En-boy oranını koruyan DPR tavanlı canvas boyutlandırma (4K ekranlarda aşırı piksel boyamayı önler)
    function fit() {
      const cw = Math.max(1, canvas.clientWidth || innerWidth);
      const ch = Math.max(1, canvas.clientHeight || innerHeight);
      const dpr = Math.min(devicePixelRatio || 1, 2, cfg.maxW / cw, cfg.maxH / ch);
      const targetW = Math.max(1, Math.round(cw * dpr));
      const targetH = Math.max(1, Math.round(ch * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'medium';
        }
        drawn = -1;
        drawSync();
      }
    }

    // 3. GPU hızlandırmalı cover çizimi (CPU üzerinde yazılımsal resizeWidth kullanılmaz)
    function drawSource(im, idx) {
      const cw = canvas.width;
      const ch = canvas.height;
      const iw = im.width || im.naturalWidth;
      const ih = im.height || im.naturalHeight;
      if (!cw || !ch || !iw || !ih) return;
      const s = Math.max(cw / iw, ch / ih);
      const dw = iw * s;
      const dh = ih * s;
      ctx.drawImage(im, (cw - dw) * 0.5, (ch - dh) * 0.5, dw, dh);
      drawn = idx;
      if (!sec.classList.contains('is-ready')) sec.classList.add('is-ready');
    }

    function findBestFrame(target) {
      if (bitmaps.has(target)) return target;
      let best = -1;
      let minDist = Infinity;
      for (const k of bitmaps.keys()) {
        const dist = Math.abs(k - target);
        if (dist < minDist) { minDist = dist; best = k; }
      }
      return best;
    }

    function drawSync() {
      if (bitmaps.has(want)) {
        const nextIdx = Math.min(cfg.n - 1, want + 1);
        const frac = wantPos - want;
        const canBlend = nextIdx > want && frac > 0.015 && bitmaps.has(nextIdx);
        if (want !== drawn || (canBlend && Math.abs(wantPos - drawnPos) > 0.012) || (!canBlend && drawnPos !== want)) {
          ctx.globalAlpha = 1;
          drawSource(bitmaps.get(want), want);
          if (canBlend) {
            ctx.globalAlpha = frac;
            drawSource(bitmaps.get(nextIdx), want);
            ctx.globalAlpha = 1;
            drawnPos = wantPos;
          } else {
            drawnPos = want;
          }
        }
        syncBitmapWindow();
        return;
      }
      const idx = findBestFrame(want);
      if (idx >= 0 && idx !== drawn) {
        drawSource(bitmaps.get(idx), idx);
      } else if (drawn < 0 && posterImg && posterImg.complete && posterImg.naturalWidth > 0) {
        drawSource(posterImg, cfg.startF);
      }
      syncBitmapWindow();
    }

    function scheduleDraw() {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        drawSync();
      });
    }

    // 4. Öncelikli Worker decode kuyruğu (want'a en yakın kare her zaman ilk sırada çözülür)
    function windowBounds() {
      const start = Math.max(cfg.startF, want - (scrollDir > 0 ? WIN_BEHIND : WIN_AHEAD));
      const end = Math.min(cfg.n - 1, want + (scrollDir > 0 ? WIN_AHEAD : WIN_BEHIND));
      return [start, end];
    }

    function pickNextToDecode() {
      const [start, end] = windowBounds();
      const maxSpan = Math.max(WIN_AHEAD, WIN_BEHIND);
      for (let dist = 0; dist <= maxSpan; dist++) {
        const fwd = want + dist * scrollDir;
        if (fwd >= start && fwd <= end && blobs[fwd] && !bitmaps.has(fwd) && !decoding.has(fwd)) return fwd;
        const bwd = want - dist * scrollDir;
        if (bwd >= start && bwd <= end && blobs[bwd] && !bitmaps.has(bwd) && !decoding.has(bwd)) return bwd;
      }
      return -1;
    }

    function pumpDecode() {
      if (typeof createImageBitmap !== 'function') return;
      while (decoding.size < MAX_DECODE) {
        const i = pickNextToDecode();
        if (i === -1) break;
        decoding.add(i);
        createImageBitmap(blobs[i]).then((bmp) => {
          decoding.delete(i);
          const [start, end] = windowBounds();
          if (i < start - 4 || i > end + 4) {
            bmp.close();
          } else {
            bitmaps.set(i, bmp);
            if (i === want || drawn < 0 || Math.abs(i - want) < Math.abs(drawn - want)) {
              scheduleDraw();
            }
          }
          pumpDecode();
        }, () => {
          decoding.delete(i);
          pumpDecode();
        });
      }
    }

    // 5. Yönlü ImageBitmap pencere yönetimi (pencere dışındaki uzak bitmap'leri VRAM'den temizler, Blob'lar RAM'de kalır)
    function syncBitmapWindow() {
      const [start, end] = windowBounds();
      for (const [k, bmp] of bitmaps) {
        if (k < start - 4 || k > end + 4) {
          bmp.close();
          bitmaps.delete(k);
        }
      }
      pumpDecode();
    }

    // Preload edilen poster görselinden ilk kareyi 0 ms gecikmeyle hazırla
    if (posterImg) {
      const warmPoster = () => {
        if (drawn < 0) drawSync();
        if (typeof createImageBitmap === 'function' && !bitmaps.has(cfg.startF) && posterImg.naturalWidth > 0) {
          createImageBitmap(posterImg).then((bmp) => {
            if (!bitmaps.has(cfg.startF)) {
              bitmaps.set(cfg.startF, bmp);
              if (want === cfg.startF && drawn !== cfg.startF) scheduleDraw();
            } else {
              bmp.close();
            }
          }, () => {});
        }
      };
      if (posterImg.complete && posterImg.naturalWidth > 0) warmPoster();
      else posterImg.addEventListener('load', warmPoster, { once: true });
    }

    // 6. 3 fazlı örgülü (4n -> 2n -> 2n+1) + dinamik hedef (want) odaklı ağ kuyruğu
    const priorityOrder = [];
    const seenOrder = new Set();
    for (const step of [1]) {
      for (let i = cfg.startF; i < cfg.n; i += step) {
        if (!seenOrder.has(i)) {
          seenOrder.add(i);
          priorityOrder.push(i);
        }
      }
    }

    function pickNextFrameToFetch() {
      if (!blobs[want] && !fetching.has(want)) return want;
      const [start, end] = windowBounds();
      for (let dist = 1; dist <= WIN_AHEAD; dist++) {
        const fwd = want + dist * scrollDir;
        if (fwd >= start && fwd <= end && !blobs[fwd] && !fetching.has(fwd)) return fwd;
      }
      for (let i = start; i <= end; i++) {
        if (!blobs[i] && !fetching.has(i)) return i;
      }
      for (const i of priorityOrder) {
        if (!blobs[i] && !fetching.has(i)) return i;
      }
      return -1;
    }

    let storyWarmed = false;
    function warmStoryImages() {
      if (storyWarmed) return;
      storyWarmed = true;
      $$('.story__img img').forEach((im) => {
        if (im.decode) im.decode().catch(() => {});
      });
    }

    async function fetchWorker() {
      while (true) {
        const i = pickNextFrameToFetch();
        if (i === -1) {
          warmStoryImages();
          break;
        }
        fetching.add(i);
        try {
          const res = await fetch(src(i), { priority: i === cfg.startF ? 'high' : 'auto' });
          if (res.ok) {
            blobs[i] = await res.blob();
            pumpDecode();
          }
        } catch (e) {
          /* ağ hatası */
        } finally {
          fetching.delete(i);
        }
      }
    }

    new ResizeObserver(fit).observe(canvas);
    fit();
    for (let c = 0; c < 6; c++) fetchWorker();

    const lines = $$('.film__name .mask > span', sec);
    const meta = [$('.film__eyebrow', sec), $('.film__role', sec)];
    gsap.set(lines, { yPercent: 150 });
    gsap.set(meta, { autoAlpha: 0, y: 14 });
    gsap.set('.film__title', { autoAlpha: 0 });
    const obj = { f: cfg.startF };

    // 7. ScrollTrigger: scrub: true ile Lenis'e 1:1 bağlanır ve rAF içindeyken senkron drawSync() çağrılır (0 kare gecikme)
    const filmTl = gsap.timeline({ defaults: { ease: 'none', immediateRender: false } });
    fwd(filmTl, {
      trigger: sec, start: 'top top',
      end: () => (isDesk() ? '+=200%' : '+=165%'),
      pin: '.film__pin', scrub: true, autoSpeed: 1 / (isMob ? 7.2 : 8.2),
      canAuto: () => {
        const nextF = Math.min(cfg.n - 1, want + 1);
        if (bitmaps.has(want) && (bitmaps.has(nextF) || want >= cfg.n - 1)) { stallFrames = 0; return true; }
        return ++stallFrames > 14;
      },
      invalidateOnRefresh: true,
      onLeave: () => { if (warmCity) warmCity(); },
    });
    filmTl
      .fromTo('.film__cue', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.10, immediateRender: false }, 0.18)
      .fromTo(obj, { f: cfg.startF }, {
        f: cfg.n - 1,
        duration: 0.92,
        onUpdate: () => {
          const nextPos = Math.min(cfg.n - 1, Math.max(cfg.startF, obj.f));
          const nextWant = Math.floor(nextPos);
          if (Math.abs(nextPos - drawnPos) > 0.012 || nextWant !== want) {
            scrollDir = nextPos >= wantPos ? 1 : -1;
            wantPos = nextPos;
            want = nextWant;
            drawSync();
          }

          if (false) {
            scrollDir = nextWant > want ? 1 : -1;
            want = nextWant;
            drawSync();
          }
        },
      }, 0)
      .fromTo('.film__shade', { opacity: 0 }, { opacity: 1, duration: 0.24 }, 0.52)
      .fromTo('.film__title', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.02, immediateRender: false }, 0.56)
      .fromTo(lines, { yPercent: 150 }, { yPercent: 0, duration: 0.22, stagger: 0.04, ease: 'power3.out' }, 0.57)
      .fromTo(meta, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.16, stagger: 0.04, ease: 'power2.out' }, 0.66)
      .to({}, { duration: 0.08 });
  }

  // ---------- 02 · Hikâye: ekran sabit, fotoğraf ve başlık sırayla değişir ----------
  // Kural: eski başlık tamamen çıkmadan yenisi girmez; hiçbir an iki metin üst üste binmez.
  (() => {
    const sec = $('.story');
    const imgs = $$('.story__img', sec);
    const chs = $$('.chapter', sec);
    const nums = $$('.story__track span', sec);
    const parts = (c) => ({ tag: $('.chapter__tag', c), title: $('.chapter__title .mask > span', c), line: $('.chapter__line', c) });

    gsap.set(imgs.slice(1), { clipPath: 'inset(100% 0% 0% 0%)' });
    gsap.set(chs.slice(1), { autoAlpha: 0 });
    chs.forEach((c, i) => {
      const p = parts(c);
      if (i) {
        gsap.set(p.title, { yPercent: 150 });
        gsap.set([p.tag, p.line], { autoAlpha: 0, y: 14 });
      }
    });

    const tl = gsap.timeline({ defaults: { ease: 'power3.inOut', immediateRender: false } });
    fwd(tl, {
      trigger: sec, start: 'top top',
      end: () => `+=${chs.length * 75}%`,
      pin: '.story__pin', scrub: 0.25,
      invalidateOnRefresh: true,
    });
    imgs.forEach((im, i) => {
      tl.fromTo($('img', im), { scale: 1.08 }, { scale: 1, duration: 1, ease: 'none' }, i ? i - 0.25 : 0);
    });
    for (let i = 1; i < chs.length; i++) {
      const a = parts(chs[i - 1]), b = parts(chs[i]);
      const t = i - 0.35;
      tl.fromTo([a.tag, a.line], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.16 }, t)
        .fromTo(a.title, { yPercent: 0 }, { yPercent: -150, duration: 0.22 }, t + 0.02)
        .set(chs[i - 1], { autoAlpha: 0 }, t + 0.24)
        .fromTo(imgs[i], { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.36 }, t + 0.04)
        .fromTo(nums, { yPercent: -100 * (i - 1) }, { yPercent: -100 * i, duration: 0.28 }, t + 0.06)
        .set(chs[i], { autoAlpha: 1 }, t + 0.14)
        .fromTo(b.title, { yPercent: 150 }, { yPercent: 0, duration: 0.28 }, t + 0.14)
        .fromTo([b.tag, b.line], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.22, stagger: 0.04 }, t + 0.26);
    }
    tl.to({}, { duration: 0.45 });
  })();

  // ---------- 03 · Liderlik: ilkeler tek tek ekrana gelir ----------
  (() => {
    const sec = $('.lead');
    const items = $$('.principle', sec);
    const nums = $$('.lead__track span', sec);
    const parts = (p) => ({ lines: $$('.principle__title .mask > span', p), line: $('.principle__line', p) });

    gsap.set(items.slice(1), { autoAlpha: 0 });
    items.forEach((p, i) => {
      const q = parts(p);
      if (i) {
        gsap.set(q.lines, { yPercent: 150 });
        gsap.set(q.line, { autoAlpha: 0, y: 14 });
      }
    });

    const tl = gsap.timeline({ defaults: { ease: 'power3.inOut', immediateRender: false } });
    fwd(tl, {
      trigger: sec, start: 'top top',
      end: () => `+=${items.length * 65}%`,
      pin: '.lead__pin', scrub: 0.25,
      invalidateOnRefresh: true,
    });
    tl.to({}, { duration: 0.45 }, 0);
    for (let i = 1; i < items.length; i++) {
      const a = parts(items[i - 1]), b = parts(items[i]);
      const t = i - 0.35;
      tl.fromTo(a.line, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.15 }, t)
        .fromTo(a.lines, { yPercent: 0 }, { yPercent: -150, duration: 0.22, stagger: 0.025 }, t + 0.02)
        .set(items[i - 1], { autoAlpha: 0 }, t + 0.25)
        .fromTo(nums, { yPercent: -100 * (i - 1) }, { yPercent: -100 * i, duration: 0.28 }, t + 0.05)
        .set(items[i], { autoAlpha: 1 }, t + 0.14)
        .fromTo(b.lines, { yPercent: 150 }, { yPercent: 0, duration: 0.28, stagger: 0.03 }, t + 0.14)
        .fromTo(b.line, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.2 }, t + 0.26);
    }
    tl.to({}, { duration: 0.45 });
  })();

  // ---------- 04 · Kent: 3D gökdelen ----------
  initCity();

  function initCity() {
    const sec = $('.city');
    const host = $('.city__canvas', sec);
    const words = $$('.city__word', sec);
    const descs = $$('.city__desc-item', sec);
    const PH = [0, 0.14, 0.32, 0.52, 0.86];
    let api = null;
    let prog = 0;
    let phase = 0;

    gsap.set(words, { yPercent: (i) => (i ? 130 : 0), autoAlpha: (i) => (i ? 0 : 1), y: 0 });
    gsap.set(descs, { autoAlpha: (i) => (i ? 0 : 1), y: 0 });

    function setPhase(n) {
      if (n === phase) return;
      const prev = phase;
      const dir = n > prev ? 1 : -1;
      phase = n;

      // Hızlı kaydırmada ara fazların ekranda asılı kalmasını engelle
      words.forEach((w, i) => {
        if (i !== n && i !== prev) {
          gsap.killTweensOf(w);
          gsap.set(w, { yPercent: i < n ? -130 : 130, autoAlpha: 0 });
        }
      });
      descs.forEach((el, i) => {
        if (i !== n && i !== prev) {
          gsap.killTweensOf(el);
          gsap.set(el, { autoAlpha: 0, y: 0 });
        }
      });

      gsap.to(words[prev], { yPercent: -150 * dir, autoAlpha: 0, duration: 0.45, ease: 'power3.inOut', overwrite: true });
      gsap.fromTo(words[n], { yPercent: 150 * dir, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.5, ease: 'power3.out', overwrite: true });
      gsap.to(descs[prev], { autoAlpha: 0, y: -6 * dir, duration: 0.24, ease: 'power2.in', overwrite: true });
      gsap.fromTo(descs[n], { autoAlpha: 0, y: 8 * dir }, { autoAlpha: 1, y: 0, duration: 0.4, delay: 0.14, ease: 'power2.out', overwrite: true });
    }

    function update(p) {
      prog = p;
      let n = 0;
      for (let i = 0; i < PH.length; i++) if (p >= PH[i]) n = i;
      setPhase(n);
      if (api) api.setProgress(p);
    }

    let cityDone = false, maxCityP = 0;
    function finishCity(st) {
      if (cityDone) return;
      cityDone = true;
      st._done = true;
      update(1);
      queueCollapse(st);
    }
    const citySt = ScrollTrigger.create({
      trigger: sec, start: 'top top',
      end: () => (isDesk() ? '+=430%' : '+=350%'),
      pin: '.city__pin', pinSpacing: true,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        if (cityDone || collapsing) return;
        maxCityP = Math.max(maxCityP, self.progress);
        if (maxCityP >= 0.88 && self.direction === -1) {
          finishCity(self);
        } else {
          update(self.progress);
        }
      },
      onLeave: (self) => { if (!collapsing) finishCity(self); }, // tamamlanınca kilitlenir ve katlanır
    });
    sceneChecks.push(() => { if (!cityDone && citySt.progress >= 1) finishCity(citySt); });

    const gl = (() => { try { const c = d.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
    if (!gl) { sec.classList.add('is-fallback'); return; }

    let started = false;
    const load = () => {
      if (started) return;
      started = true;
      // main.js ile aynı sürüm etiketiyle yüklenir (?v=...), eski önbellek kopyası kullanılmaz
      import((() => { const s = new URL($('script[src*="js/main.js"]').src); return new URL('city3d.js' + (s.searchParams.get('v3d') ? '?v=' + s.searchParams.get('v3d') : ''), s).href; })())
        .then((m) => m.createCity(host, { mobile: !isDesk(), logoUrl: host.dataset.logo }))
        .then((a) => { api = a; update(prog); requestAnimationFrame(() => { host.classList.add('is-ready'); sec.classList.add('is-ready'); }); })
        .catch((err) => { console.warn('3D sahne yüklenemedi:', err); sec.classList.add('is-fallback'); });
    };
    warmCity = () => (window.requestIdleCallback ? requestIdleCallback(load, { timeout: 1500 }) : setTimeout(load, 300));
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { io.disconnect(); load(); }
    }, { rootMargin: '150% 0px' });
    io.observe(sec);
  }

  // ---------- 07 · İmza Siteler: ekran sabit, katalog sağa doğru akar ----------
  (() => {
    const sec = $('.catalog');
    if (!sec) return;
    const viewport = $('.catalog__viewport', sec);
    const track = $('.catalog__track', sec);
    const cards = $$('.cat', sec);
    const nums = $$('.catalog__track-n span', sec);
    const bar = $('.catalog__bar i', sec);
    const dist = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
    let active = 0;

    // Sayaç ve çizgi, kaydırma anında değil animasyonun her karesinde güncellenir (yumuşak geçişte doğru kart)
    const syncMeta = () => {
      const x = gsap.getProperty(track, 'x');
      const total = dist() || 1;
      gsap.set(bar, { scaleX: Math.min(1, -x / total) });
      const mid = viewport.clientWidth / 2 - x;
      let best = 0, bestD = Infinity;
      cards.forEach((c, i) => { const dd = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (dd < bestD) { bestD = dd; best = i; } });
      if (best !== active) { active = best; gsap.to(nums, { yPercent: -100 * best, duration: 0.6, ease: 'power3.out', overwrite: true }); }
    };
    const slide = gsap.fromTo(track, { x: 0 }, {
      x: () => -dist(), ease: 'none', onUpdate: syncMeta,
      scrollTrigger: {
        trigger: sec, start: 'top top', end: () => `+=${dist()}`,
        pin: '.catalog__pin', scrub: 0.6, invalidateOnRefresh: true,
      },
    });

    // Görsel kart içinde hafif paralaks ile kayar; kart metinleri her zaman görünür ve net kalır
    cards.forEach((c) => {
      gsap.fromTo($('.cat__media img', c), { xPercent: -4 }, {
        xPercent: 4, ease: 'none',
        scrollTrigger: { trigger: c, containerAnimation: slide, start: 'left right', end: 'right left', scrub: true },
      });
    });
  })();

  // ---------- 08 · Sözler: ilk söz başlangıçta görünür, diğerleri sırayla gelir ----------
  (() => {
    const quotes = $$('.quote');
    const sets = quotes.map((q) => splitWords($('blockquote p', q)));
    const caps = quotes.map((q) => $('figcaption', q));

    // İlk söz başlangıçta görünür; böylece bölüme girildiğinde boş ekran olmaz
    gsap.set(quotes[0], { autoAlpha: 1 });
    gsap.set(sets[0], { yPercent: 0 });
    gsap.set(caps[0], { autoAlpha: 1, y: 0 });

    gsap.set(quotes.slice(1), { autoAlpha: 0 });
    gsap.set(sets.slice(1).flat(), { yPercent: 150 });
    gsap.set(caps.slice(1), { autoAlpha: 0, y: 10 });

    const tl = gsap.timeline({ defaults: { ease: 'power3.inOut', immediateRender: false } });
    fwd(tl, {
      trigger: '.quotes', start: 'top top',
      end: () => `+=${quotes.length * 65}%`,
      pin: '.quotes__pin', scrub: 0.25,
      invalidateOnRefresh: true,
    });
    tl.to({}, { duration: 0.45 });
    for (let i = 1; i < quotes.length; i++) {
      tl.fromTo(sets[i - 1], { yPercent: 0 }, { yPercent: -150, duration: 0.45, stagger: 0.015 })
        .fromTo(caps[i - 1], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -8, duration: 0.24 }, '<')
        .set(quotes[i - 1], { autoAlpha: 0 })
        .set(quotes[i], { autoAlpha: 1 })
        .fromTo(sets[i], { yPercent: 150 }, { yPercent: 0, duration: 0.55, stagger: 0.022 })
        .fromTo(caps[i], { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.28 }, '<0.22')
        .to({}, { duration: 0.5 });
    }
  })();

  // ======================================================================
  // 2. SABİTLENMEYEN SAHNELER VE GENEL TETİKLEYİCİLER (PIN'LERDEN SONRA)
  // ======================================================================

  // ---------- 01 · Manifesto: okuyucu cümleyi kaydırarak yazar ----------
  $$('[data-scrub-words]').forEach((p) => {
    const words = new SplitType(p, { types: 'words' }).words;
    gsap.set(words, { opacity: 0.34 });
    fwd(gsap.to(words, { opacity: 1, ease: 'none', stagger: 0.08 }), { trigger: p, start: 'top 90%', end: 'center 52%', scrub: 0.2 });
  });

  // ---------- Başlıklar: kelime maskesi ----------
  $$('[data-words]').forEach((h) => {
    const inner = splitWords(h);
    gsap.from(inner, {
      yPercent: 125, duration: 1.2, stagger: 0.06,
      scrollTrigger: { trigger: h, start: 'top 88%', once: true },
    });
  });

  // ---------- Kısa metin grupları ----------
  $$('[data-stagger]').forEach((g) => {
    gsap.from(g.children, {
      y: 20, autoAlpha: 0, duration: 1.1, stagger: 0.08,
      scrollTrigger: { trigger: g, start: 'top 90%', once: true },
    });
  });

  // ---------- 05 · Rakamlar: görünür girer ve akıcı biçimde sayar ----------
  $$('.figure').forEach((fig) => {
    const num = $('[data-count]', fig);
    const target = +num.dataset.count;
    const dim = $('.dim', fig);
    const label = $('.figure__l', fig);
    const obj = { v: 0 };

    gsap.set(dim, { '--t': 0 });
    gsap.set($('i', dim), { scaleX: 0 });
    gsap.set(label, { autoAlpha: 0.85, y: 0 });

    ScrollTrigger.create({
      trigger: fig, start: 'top 90%', once: true,
      onEnter() {
        gsap.to(dim, { '--t': 1, duration: 0.4, ease: 'power2.out' });
        gsap.to($('i', dim), { scaleX: 1, duration: 1.1, ease: 'expo.out', delay: 0.08 });
        gsap.to(obj, {
          v: target, duration: 1.35, ease: 'power3.out',
          onUpdate: () => { num.textContent = fmt(obj.v); },
        });
        gsap.to(label, { autoAlpha: 1, duration: 0.6 });
      },
    });
  });

  // ---------- 06 · Tarihçe: dikey çizgi scroll ile ilerler ----------
  (() => {
    const tlEl = $('.tl');
    const rail = $('.tl__rail');
    fwd(gsap.to('.tl__fill', { scaleY: 1, ease: 'none' }), { trigger: tlEl, start: 'top 68%', end: 'bottom 68%', scrub: 0.2 });
    fwd(gsap.to('.tl__pen', { y: () => rail.offsetHeight, ease: 'none' }), { trigger: tlEl, start: 'top 68%', end: 'bottom 68%', scrub: 0.2, invalidateOnRefresh: true });
    $$('.tl__item').forEach((it) => {
      const yr = $('.tl__year span', it);
      const body = $('.tl__body', it).children;
      const t = gsap.timeline({ paused: true });
      t.fromTo(yr, { yPercent: 120, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 1.15, ease: 'expo.out' })
        .fromTo(body, { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.95, stagger: 0.07, ease: 'power3.out' }, 0.15);
      ScrollTrigger.create({
        trigger: it, start: 'top 68%',
        onEnter: () => { it.classList.add('is-reached'); t.play(); },
        onLeaveBack: () => it.classList.remove('is-reached'),
      });
      ScrollTrigger.create({
        trigger: it, start: 'top 92%',
        onEnter: () => t.play(),
        onEnterBack: () => t.play(),
      });
    });
  })();

  // ---------- 07 · İmza siteler: çizim hızlıca gerçek yapıya dönüşür ----------
  $$('.project__art').forEach((art) => {
    const blocks = +art.dataset.blocks || 1;
    const floors = +art.dataset.floors || 8;
    const labels = (art.dataset.labels || '').split(',').filter(Boolean);
    const bp = d.createElement('div');
    bp.className = 'project__bp';
    bp.innerHTML = blueprintSVG(blocks, floors, labels);
    art.appendChild(bp);
    const img = $('.project__img', art);
    const tag = d.createElement('span');
    tag.className = 'project__tag' + (img ? '' : ' project__tag--dark');
    tag.textContent = img ? 'Görselleştirme' : 'Temsili çizim';
    art.appendChild(tag);

    const lines = $$('.bp-line, .bp-dim', bp);
    const thins = $$('.bp-thin, .bp-text', bp);
    lines.forEach((l) => { const len = l.getTotalLength ? l.getTotalLength() : 600; l.style.strokeDasharray = len; l.style.strokeDashoffset = len; });
    gsap.set(thins, { autoAlpha: 0 });
    const info = $('.project__info', art.parentElement);

    const tl = gsap.timeline({ defaults: { ease: 'none' } });
    fwd(tl, { trigger: art, start: 'top 92%', end: isDesk() ? 'top 26%' : 'top 32%', scrub: 0.2 });
    tl.to(lines, { strokeDashoffset: 0, duration: 0.4, stagger: 0.15 / Math.max(1, lines.length) }, 0)
      .to(thins, { autoAlpha: 1, duration: 0.25 }, 0.16);
    if (img) {
      tl.fromTo(bp, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.55, ease: 'power2.inOut' }, 0.34)
        .fromTo(img, { scale: 1.1 }, { scale: 1, duration: 0.7 }, 0.25);
    }

    gsap.from(info.children, {
      y: 20, autoAlpha: 0, duration: 1.05, stagger: 0.07,
      scrollTrigger: { trigger: info, start: 'top 88%', once: true },
    });

    if (fine && img) {
      const rx = gsap.quickTo(img, 'rotationY', { duration: 1.1, ease: 'power3.out' });
      const ry = gsap.quickTo(img, 'rotationX', { duration: 1.1, ease: 'power3.out' });
      gsap.set(art, { perspective: 1200 });
      art.addEventListener('mousemove', (e) => {
        const r = art.getBoundingClientRect();
        rx(((e.clientX - r.left) / r.width - 0.5) * 4);
        ry(((e.clientY - r.top) / r.height - 0.5) * -3);
      });
      art.addEventListener('mouseleave', () => { rx(0); ry(0); });
    }
  });

  function blueprintSVG(n, floors, labels) {
    const W = 600, G = 356, TOP = 56, gap = 26, margin = 54;
    const bw = Math.min(210, (W - margin * 2 - gap * (n - 1)) / n);
    const total = bw * n + gap * (n - 1);
    const x0 = (W - total) / 2;
    const fh = (G - TOP) / floors;
    let s = `<svg viewBox="0 0 ${W} 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`;
    s += `<path class="bp-line" d="M10 ${G} H${W - 10}"/>`;
    for (let b = 0; b < n; b++) {
      const x = x0 + b * (bw + gap);
      const yTop = G - floors * fh;
      s += `<path class="bp-line" d="M${x} ${G} V${yTop} H${x + bw} V${G}"/>`;
      s += `<path class="bp-line" d="M${x - 5} ${yTop} H${x + bw + 5}"/>`;
      for (let f = 1; f < floors; f++) {
        const y = G - f * fh;
        s += `<path class="bp-thin" d="M${x} ${y} H${x + bw}"/>`;
      }
      const cols = Math.max(3, Math.round(bw / 36));
      const cw = (bw - 16) / cols;
      for (let f = 1; f < floors; f++) {
        const y = G - (f + 1) * fh + fh * 0.28;
        let dd = '';
        for (let c = 0; c < cols; c++) {
          const wx = x + 8 + c * cw + cw * 0.22;
          dd += `M${wx.toFixed(1)} ${y.toFixed(1)} h${(cw * 0.56).toFixed(1)} v${(fh * 0.46).toFixed(1)} h${(-cw * 0.56).toFixed(1)} Z `;
        }
        s += `<path class="bp-thin" d="${dd}"/>`;
      }
      s += `<path class="bp-line" d="M${x + bw / 2 - 12} ${G} V${G - fh * 0.8} H${x + bw / 2 + 12} V${G}"/>`;
      if (labels[b]) s += `<text class="bp-text" x="${x + bw / 2}" y="${G + 26}" text-anchor="middle">${labels[b]} BLOK</text>`;
    }
    const yTop = G - floors * fh;
    s += `<path class="bp-dim" d="M${x0 - 26} ${G} V${yTop} M${x0 - 32} ${G} H${x0 - 20} M${x0 - 32} ${yTop} H${x0 - 20}"/>`;
    s += `<path class="bp-dim" d="M${x0} ${G + 40} H${x0 + total} M${x0} ${G + 34} V${G + 46} M${x0 + total} ${G + 34} V${G + 46}"/>`;
    s += '</svg>';
    return s;
  }

  // ---------- 09 · Grup satırları ----------
  gsap.from('.eco__row', {
    y: 24, autoAlpha: 0, duration: 1.1, stagger: 0.07,
    scrollTrigger: { trigger: '.eco__list', start: 'top 88%', once: true },
  });

  // ---------- 10 · Form ve kapanış ----------
  gsap.from('.form > *', {
    y: 20, autoAlpha: 0, duration: 1.05, stagger: 0.04,
    scrollTrigger: { trigger: '.form', start: 'top 88%', once: true },
  });
  gsap.from('.fcta__title .mask > span', {
    yPercent: 125, duration: 1.35, stagger: 0.1,
    scrollTrigger: { trigger: '.fcta', start: 'top 86%', once: true },
  });
  gsap.from(['.fcta__actions', '.fsign', '.fcol', '.office', '.fsocial'], {
    y: 18, autoAlpha: 0, duration: 1.05, stagger: 0.05,
    scrollTrigger: { trigger: '.fmain', start: 'top 90%', once: true },
  });
  gsap.fromTo('.fmark', { yPercent: 25 }, {
    yPercent: 0, ease: 'none',
    scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true },
  });

  // ---------- Header, ilerleme, tema (tüm pin'lerden sonra hesaplanır) ----------
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate(self) {
      progressBar.style.setProperty('--p', self.progress.toFixed(4));
      const y = self.scroll();
      header.classList.toggle('is-hidden', !menuOpen && self.direction === 1 && y > innerHeight * 0.6);
    },
  });

  $$('[data-theme]').forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec, start: 'top 48px', end: 'bottom 48px',
      onToggle(self) {
        if (!self.isActive) return;
        const dark = sec.dataset.theme === 'dark';
        header.classList.toggle('is-dark', dark);
        cursor && cursor.classList.toggle('is-dark', dark);
        if (sec.dataset.index) progressNum.textContent = sec.dataset.index;
      },
    });
  });

  initMenu();
  initForm();
  initAnchors();
  if (fine) { initCursor(); initMagnetic(); }

  // Görseller geç yüklendiğinde konumları tazele (aktif kaydırma sırasında araya girip takılma yapmasın)
  addEventListener('load', () => {
    if (!introDone) return;
    const refreshWhenIdle = () => {
      if (lenis && lenis.isScrolling) setTimeout(refreshWhenIdle, 180);
      else ScrollTrigger.refresh();
    };
    refreshWhenIdle();
  });

  // ======================================================================
  function initAnchors() {
    $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const target = id === '#top' ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      const go = () => {
        if (lenis) lenis.scrollTo(target, { duration: 1.5, easing: (t) => 1 - Math.pow(1 - t, 4) });
        else if (target === 0) scrollTo({ top: 0 });
        else target.scrollIntoView();
      };
      if (menuOpen) closeMenu(go); else go();
    }));
  }

  function initMenu() {
    const btn = $('.menu-btn');
    const menu = $('#menu');
    const label = $('.menu-btn__label', btn);
    const preview = $('.menu__preview img', menu);
    const items = $$('.menu__txt', menu);
    const extras = [$('.menu__eyebrow', menu), $('.menu__foot', menu), ...$$('.menu__num', menu)];

    btn.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); });

    $$('.menu__list a', menu).forEach((a) => {
      a.addEventListener('mouseenter', () => {
        if (!preview || !a.dataset.img) return;
        const src = `assets/img/${a.dataset.img}-1080.webp`;
        if (preview.getAttribute('src') === src) return;
        if (!hasGsap || reduce) { preview.src = src; return; }
        gsap.to(preview, { autoAlpha: 0, duration: 0.25, onComplete: () => { preview.src = src; gsap.fromTo(preview, { scale: 1.08 }, { autoAlpha: 1, scale: 1, duration: 1.2 }); } });
      });
    });

    let menuTl = null;
    function openMenu() {
      menuOpen = true;
      menu.hidden = false;
      html.classList.add('menu-open');
      btn.setAttribute('aria-expanded', 'true');
      label.textContent = label.dataset.close;
      lenis && lenis.stop();
      if (menuTl) menuTl.kill();
      if (!hasGsap || reduce) { gsap.set(menu, { autoAlpha: 1 }); gsap.set([items, extras], { clearProps: 'all' }); $('a', menu).focus(); return; }
      menuTl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        .fromTo(menu, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.26, ease: 'power2.out' }, 0)
        .fromTo(extras, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.36, stagger: 0.015 }, 0.04)
        .fromTo(items, { yPercent: 40, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.44, stagger: 0.032 }, 0.04)
        .fromTo(preview, { scale: 1.06, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.65 }, 0.04)
        .add(() => $('a', menu).focus({ preventScroll: true }), 0.25);
    }
    function close(cb) {
      menuOpen = false;
      btn.setAttribute('aria-expanded', 'false');
      label.textContent = label.dataset.open;
      html.classList.remove('menu-open');
      if (menuTl) menuTl.kill();
      const done = () => { menu.hidden = true; lenis && lenis.start(); cb && cb(); };
      if (!hasGsap || reduce) { done(); return; }
      menuTl = gsap.timeline({ onComplete: done })
        .to([items, extras], { y: -10, autoAlpha: 0, duration: 0.18, ease: 'power2.in' }, 0)
        .to(menu, { autoAlpha: 0, duration: 0.24, ease: 'power2.inOut' }, 0.06);
    }
    window.__closeMenu = close;
  }
  function closeMenu(cb) { window.__closeMenu(cb); }

  function initCursor() {
    html.classList.add('has-cursor');
    const dot = $('.cursor__dot'), ring = $('.cursor__ring'), lab = $('.cursor__label');
    const dx = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3.out' });
    const dy = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3.out' });
    const rx = gsap.quickTo(ring, 'x', { duration: 0.55, ease: 'power3.out' });
    const ry = gsap.quickTo(ring, 'y', { duration: 0.55, ease: 'power3.out' });
    addEventListener('mousemove', (e) => { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); });
    d.addEventListener('mouseover', (e) => {
      const t = e.target.closest('[data-cursor], a, button, label, input, select, textarea');
      cursor.classList.remove('is-link', 'is-label');
      if (!t) return;
      if (t.dataset.cursor) { lab.textContent = t.dataset.cursor; cursor.classList.add('is-label'); }
      else cursor.classList.add('is-link');
    });
    d.addEventListener('mouseleave', () => gsap.to(cursor, { autoAlpha: 0, duration: 0.3 }));
    d.addEventListener('mouseenter', () => gsap.to(cursor, { autoAlpha: 1, duration: 0.3 }));
  }

  function initMagnetic() {
    $$('.magnetic').forEach((el) => {
      const qx = gsap.quickTo(el, 'x', { duration: 0.9, ease: 'expo.out' });
      const qy = gsap.quickTo(el, 'y', { duration: 0.9, ease: 'expo.out' });
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        qx(gsap.utils.clamp(-10, 10, (e.clientX - r.left - r.width / 2) * 0.3));
        qy(gsap.utils.clamp(-10, 10, (e.clientY - r.top - r.height / 2) * 0.3));
      });
      el.addEventListener('mouseleave', () => { qx(0); qy(0); });
    });
  }

  function initForm() {
    const form = $('.form');
    if (!form) return;
    const status = $('.form__status', form);
    const btn = $('.btn', form);
    const blocks = $$('[data-for]', form);
    const RECIPIENT = { genel: 'iletisim@fetsangrup.com', basin: 'iletisim@fetsangrup.com', isbirligi: 'umitfettahoglu@fetsangrup.com', yatirim: 'umitfettahoglu@fetsangrup.com' };
    const TITLE = { genel: 'Genel', isbirligi: 'İş Birliği', yatirim: 'Yatırım', basin: 'Basın & Medya' };
    const LABEL = { ad: 'Ad Soyad', eposta: 'E-posta', telefon: 'Telefon', firma: 'Firma / Kurum', bolge: 'Bölge / İlçe', konu: 'İş birliği konusu', yatirimTipi: 'Yatırım tipi', butce: 'Bütçe aralığı', mesaj: 'Mesaj' };

    const type = () => form.querySelector('input[name="tur"]:checked').value;
    function applyType(animate) {
      const v = type();
      blocks.forEach((b) => {
        const on = b.dataset.for.split(' ').includes(v);
        b.hidden = !on;
        $$('input, select, textarea', b).forEach((i) => { i.disabled = !on; });
        if (b.matches('input, select, textarea')) b.disabled = !on;
        if (on && animate && hasGsap && !reduce) gsap.fromTo(b, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.8 });
      });
      if (hasGsap) ScrollTrigger.refresh();
    }
    $$('input[name="tur"]', form).forEach((r) => r.addEventListener('change', () => applyType(true)));
    applyType(false);

    $$('select', form).forEach((s) => s.addEventListener('change', () => s.closest('.field').classList.toggle('has-value', !!s.value)));

    const tel = $('#f-tel');
    tel.addEventListener('input', () => {
      let v = tel.value.replace(/\D/g, '');
      if (v.startsWith('90')) v = v.slice(2);
      if (v && v[0] !== '0') v = '0' + v;
      v = v.slice(0, 11);
      const p = [v.slice(0, 1), v.slice(1, 4), v.slice(4, 7), v.slice(7, 9), v.slice(9, 11)];
      let out = p[0];
      if (p[1]) out += ` (${p[1]}`;
      if (p[1].length === 3) out += ')';
      if (p[2]) out += ` ${p[2]}`;
      if (p[3]) out += ` ${p[3]}`;
      if (p[4]) out += ` ${p[4]}`;
      tel.value = out;
    });

    function check(el) {
      if (el.disabled || el.type === 'radio' || el.classList.contains('hp')) return true;
      const err = $(`#e-${el.name}`, form);
      let msg = '';
      const v = el.type === 'checkbox' ? el.checked : el.value.trim();
      if (el.required && !v) msg = el.type === 'checkbox' ? 'Devam etmek için KVKK metnini onaylayın.' : 'Bu alan zorunludur.';
      else if (el.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) msg = 'Geçerli bir e-posta adresi girin.';
      else if (el.type === 'tel' && v && v.replace(/\D/g, '').length !== 11) msg = 'Telefon numarasını eksiksiz girin.';
      else if (el.name === 'mesaj' && v && v.length < 10) msg = 'Lütfen en az 10 karakterlik bir mesaj yazın.';
      if (err) { err.textContent = msg; el.setAttribute('aria-describedby', err.id); }
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const f = el.closest('.field');
      if (f) f.classList.toggle('is-invalid', !!msg);
      return !msg;
    }
    $$('input, select, textarea', form).forEach((el) => {
      el.addEventListener('blur', () => { if (el.value || el.getAttribute('aria-invalid') === 'true') check(el); });
      el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') check(el); });
      el.addEventListener('change', () => { if (el.type === 'checkbox') check(el); });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.website.value) return; // bot
      const fields = $$('input, select, textarea', form).filter((el) => !el.disabled && el.name && el.type !== 'radio' && !el.classList.contains('hp'));
      const bad = fields.filter((el) => !check(el));
      if (bad.length) { bad[0].focus(); status.textContent = 'Lütfen işaretli alanları kontrol edin.'; return; }

      const t = type();
      const data = { tur: TITLE[t] };
      fields.forEach((el) => { if (el.type !== 'checkbox' && el.value.trim()) data[el.name] = el.value.trim(); });
      btn.classList.add('is-loading'); btn.disabled = true;

      const endpoint = form.dataset.endpoint;
      try {
        if (endpoint) {
          const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          const resJson = await r.json().catch(() => ({})); if (r.status === 404 || r.status === 503 || resJson.fallback === 'mailto') { const body = Object.entries(data).filter(([k]) => k !== 'tur').map(([k, v]) => `${LABEL[k] || k}: ${v}`).join('\n'); const subject = `[${TITLE[t]}] ${data.ad}`; location.href = `mailto:${RECIPIENT[t]}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; status.textContent = 'E-posta uygulamanız açılıyor; gönder dediğinizde talebiniz iletilecek.'; return; } if (!r.ok) throw new Error(r.status);
          status.textContent = 'Talebiniz alındı. En kısa sürede size dönüş yapılacaktır.';
          form.reset(); applyType(false);
        } else {
          const body = Object.entries(data).filter(([k]) => k !== 'tur').map(([k, v]) => `${LABEL[k] || k}: ${v}`).join('\n');
          const subject = `[${TITLE[t]}] ${data.ad}`;
          location.href = `mailto:${RECIPIENT[t]}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          status.textContent = 'E-posta uygulamanız açılıyor; gönder dediğinizde talebiniz iletilecek.';
        }
      } catch (err) {
        status.textContent = 'Gönderim sırasında bir sorun oluştu. Lütfen 444 7 097 numarasından bize ulaşın.';
      } finally {
        btn.classList.remove('is-loading'); btn.disabled = false;
      }
    });
  }
})();
