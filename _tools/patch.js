const fs = require('fs');
let s = fs.readFileSync('js/main.js', 'utf8');
const rep = (a, b, ins) => { const i = s.indexOf(a), j = s.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('marker ' + a); s = s.slice(0, i) + ins + s.slice(j); };

rep('    function load(i) {', '  // ---------- Manifesto', `    function load(i) {
      const im = new Image();
      im.decoding = 'async';
      im.src = src(i);
      // Kare ekrana çizilmeden önce arka planda çözülür; kaydırırken ana iş parçacığı tıkanmaz
      const ready = () => { frames[i] = im; if (drawn < 0 || Math.abs(i - want) < Math.abs(drawn - want)) request(); };
      (im.decode ? im.decode() : Promise.reject()).then(ready, () => { im.onload = ready; if (im.complete) ready(); });
    }
    load(0);
    // Kalan kareler: önce her 4. kare (hızlı kaba akış), sonra aradakiler; tarayıcı boşta kaldığında
    const rest = () => {
      const order = [];
      for (let i = 4; i < cfg.n; i += 4) order.push(i);
      for (let i = 1; i < cfg.n; i++) if (i % 4) order.push(i);
      let k = 0;
      const batch = () => { for (let n = 0; n < 8 && k < order.length; n++) load(order[k++]); if (k < order.length) setTimeout(batch, 60); };
      batch();
    };
    if (d.readyState === 'complete') setTimeout(rest, 200); else addEventListener('load', () => setTimeout(rest, 200));
    new ResizeObserver(fit).observe(canvas);

    const lines = $$('.film__name .mask > span', sec);
    const meta = [$('.film__eyebrow', sec), $('.film__role', sec)];
    gsap.set(lines, { yPercent: 110 });
    gsap.set(meta, { autoAlpha: 0, y: 12 });
    const obj = { f: 0 };
    gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: sec, start: 'top top',
        end: () => (isDesk() ? '+=260%' : '+=220%'),
        pin: '.film__pin', scrub: 0.6,
      },
    })
      .fromTo('.film__cue', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.06, immediateRender: false }, 0)
      .fromTo(obj, { f: 0 }, { f: cfg.n - 1, duration: 0.8, onUpdate: () => { want = Math.round(obj.f); request(); } }, 0)
      .fromTo('.film__shade', { opacity: 0 }, { opacity: 1, duration: 0.14 }, 0.72)
      .fromTo(lines, { yPercent: 110 }, { yPercent: 0, duration: 0.14, stagger: 0.04, ease: 'power3.out' }, 0.8)
      .fromTo(meta, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.1, stagger: 0.03, ease: 'power2.out' }, 0.86)
      .to({}, { duration: 0.08 });
  }

`);

rep('  // ---------- 02 · Hikâye', '  // ---------- 04 · Kent', `  // ---------- 02 · Hikâye: ekran sabit, fotoğraf ve başlık sırayla değişir ----------
  // Kural: eski başlık tamamen çıkmadan yenisi girmez; hiçbir an iki metin üst üste binmez.
  (() => {
    const sec = $('.story');
    const imgs = $$('.story__img', sec);
    const chs = $$('.chapter', sec);
    const nums = $$('.story__track span', sec);
    const parts = (c) => ({ tag: $('.chapter__tag', c), title: $('.chapter__title .mask > span', c), line: $('.chapter__line', c) });
    gsap.set(imgs.slice(1), { clipPath: 'inset(100% 0% 0% 0%)' });
    chs.forEach((c, i) => {
      const p = parts(c);
      if (i) { gsap.set(p.title, { yPercent: 110 }); gsap.set([p.tag, p.line], { autoAlpha: 0, y: 14 }); }
    });

    const tl = gsap.timeline({
      defaults: { ease: 'power3.inOut', immediateRender: false },
      scrollTrigger: { trigger: sec, start: 'top top', end: () => \`+=\${(chs.length - 0.2) * 100}%\`, pin: '.story__pin', scrub: 0.7 },
    });
    imgs.forEach((im, i) => { tl.fromTo($('img', im), { scale: 1.1 }, { scale: 1, duration: 1.1, ease: 'none' }, i ? i - 0.3 : 0); });
    for (let i = 1; i < chs.length; i++) {
      const a = parts(chs[i - 1]), b = parts(chs[i]);
      const t = i - 0.4;
      tl.fromTo([a.tag, a.line], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.18 }, t)
        .fromTo(a.title, { yPercent: 0 }, { yPercent: -110, duration: 0.24 }, t + 0.04)
        .fromTo(imgs[i], { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.42 }, t + 0.08)
        .fromTo(nums, { yPercent: -100 * (i - 1) }, { yPercent: -100 * i, duration: 0.3 }, t + 0.1)
        .fromTo(b.title, { yPercent: 110 }, { yPercent: 0, duration: 0.3 }, t + 0.3)
        .fromTo([b.tag, b.line], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.22, stagger: 0.05 }, t + 0.42);
    }
    tl.to({}, { duration: 0.25 });
  })();

  // ---------- 03 · Liderlik: ilkeler tek tek ekrana gelir ----------
  (() => {
    const sec = $('.lead');
    const items = $$('.principle', sec);
    const nums = $$('.lead__track span', sec);
    const parts = (p) => ({ lines: $$('.principle__title .mask > span', p), line: $('.principle__line', p) });
    items.forEach((p, i) => {
      const q = parts(p);
      if (i) { gsap.set(q.lines, { yPercent: 110 }); gsap.set(q.line, { autoAlpha: 0, y: 14 }); }
    });

    const tl = gsap.timeline({
      defaults: { ease: 'power3.inOut', immediateRender: false },
      scrollTrigger: { trigger: sec, start: 'top top', end: () => \`+=\${(items.length - 0.3) * 80}%\`, pin: '.lead__pin', scrub: 0.7 },
    });
    for (let i = 1; i < items.length; i++) {
      const a = parts(items[i - 1]), b = parts(items[i]);
      const t = i - 0.45;
      tl.fromTo(a.line, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.18 }, t)
        .fromTo(a.lines, { yPercent: 0 }, { yPercent: -110, duration: 0.24, stagger: 0.03 }, t + 0.04)
        .fromTo(nums, { yPercent: -100 * (i - 1) }, { yPercent: -100 * i, duration: 0.36 }, t + 0.08)
        .fromTo(b.lines, { yPercent: 110 }, { yPercent: 0, duration: 0.3, stagger: 0.04 }, t + 0.34)
        .fromTo(b.line, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.22 }, t + 0.48);
    }
    tl.to({}, { duration: 0.3 });
  })();

`);

// Kent: açıklama metni eskisi kaybolduktan sonra gelsin; pin ayarları
s = s.replace("gsap.fromTo(descs[n], { autoAlpha: 0, y: 8 * dir }, { autoAlpha: 1, y: 0, duration: 0.8, delay: 0.25, ease: 'power2.out', overwrite: true });",
  "gsap.fromTo(descs[n], { autoAlpha: 0, y: 8 * dir }, { autoAlpha: 1, y: 0, duration: 0.7, delay: 0.5, ease: 'power2.out', overwrite: true });");
s = s.replace("gsap.to(descs[phase], { autoAlpha: 0, y: -8 * dir, duration: 0.5, ease: 'power2.out', overwrite: true });",
  "gsap.to(descs[phase], { autoAlpha: 0, y: -8 * dir, duration: 0.4, ease: 'power2.in', overwrite: true });");
s = s.replace(/, anticipatePin: 1/g, '');
s = s.replace("pin: '.city__pin', pinSpacing: true,", "pin: '.city__pin', pinSpacing: true,");
fs.writeFileSync('js/main.js', s);
console.log('patched', (s.match(/anticipatePin/g) || []).length);
