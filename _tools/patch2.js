const fs = require('fs');
let s = fs.readFileSync('js/main.js', 'utf8');
const must = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 60)); s = s.replace(a, b); };

// Yardımcı: sahne çıkış perdesi (bir sonraki bölümün rengi)
must("  // ---------- Header, ilerleme, tema ----------", `  // ---------- Sahne geçişi: sabit sahnenin sonunda sonraki bölümün rengi perde gibi açılır ----------
  function wipe(pin, color, shape) {
    const el = d.createElement('div');
    el.className = 'scene-wipe';
    el.style.background = color;
    el.setAttribute('aria-hidden', 'true');
    $(pin).appendChild(el);
    const from = shape === 'circle' ? 'circle(0% at 50% 56%)' : 'inset(100% 0% 0% 0%)';
    const to = shape === 'circle' ? 'circle(75% at 50% 56%)' : 'inset(0% 0% 0% 0%)';
    gsap.set(el, { clipPath: from });
    return { el, from, to };
  }
  const PAPER = '#F3F2EE', WHITE = '#FBFAF8', DARK = '#17181A';

  // ---------- Header, ilerleme, tema ----------`);

// Film: isim büyür, ortadan açılan daireyle manifestonun kâğıt zemini gelir
must("        end: () => (isDesk() ? '+=260%' : '+=220%'),\n        pin: '.film__pin', scrub: 0.6,", "        end: () => (isDesk() ? '+=300%' : '+=260%'),\n        pin: '.film__pin', scrub: 0.6,");
must(`      .fromTo(meta, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.1, stagger: 0.03, ease: 'power2.out' }, 0.86)
      .to({}, { duration: 0.08 });`, `      .fromTo(meta, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.1, stagger: 0.03, ease: 'power2.out' }, 0.86)
      .to({}, { duration: 0.06 })
      .fromTo('.film__title', { scale: 1, autoAlpha: 1 }, { scale: 2.4, autoAlpha: 0, duration: 0.2, ease: 'power2.in' })
      .fromTo(fw.el, { clipPath: fw.from }, { clipPath: fw.to, duration: 0.16, ease: 'power2.inOut' }, '<0.07');`);
must("    const obj = { f: 0 };\n    gsap.timeline({", "    const obj = { f: 0 };\n    const fw = wipe('.film__pin', PAPER, 'circle');\n    gsap.timeline({");

// Hikâye → Liderlik (beyaz)
must(`    tl.to({}, { duration: 0.25 });
  })();

  // ---------- 03 · Liderlik`, `    const sw = wipe('.story__pin', WHITE);
    tl.to({}, { duration: 0.2 }).fromTo(sw.el, { clipPath: sw.from }, { clipPath: sw.to, duration: 0.35, ease: 'power3.inOut' });
  })();

  // ---------- 03 · Liderlik`);
must("end: () => `+=${(chs.length - 0.2) * 100}%`", "end: () => `+=${chs.length * 100}%`");

// Liderlik → Kent (antrasit)
must(`    tl.to({}, { duration: 0.3 });
  })();

  // ---------- 04 · Kent`, `    const lw = wipe('.lead__pin', DARK);
    tl.to({}, { duration: 0.25 }).fromTo(lw.el, { clipPath: lw.from }, { clipPath: lw.to, duration: 0.35, ease: 'power3.inOut' });
  })();

  // ---------- 04 · Kent`);
must("end: () => `+=${(items.length - 0.3) * 80}%`", "end: () => `+=${items.length * 80}%`");

// Sözler → Grup (kâğıt)
must(`      show(i);
    }
  })();`, `      show(i);
    }
    const qw = wipe('.quotes__pin', PAPER);
    tl.fromTo(qw.el, { clipPath: qw.from }, { clipPath: qw.to, duration: 0.6, ease: 'power3.inOut' });
  })();`);
must("end: () => `+=${quotes.length * 70}%`", "end: () => `+=${quotes.length * 80}%`");

// Kent → Rakamlar (kâğıt): pin süresinin son %8'inde
must(`    ScrollTrigger.create({
      trigger: sec, start: 'top top',
      end: () => (isDesk() ? '+=340%' : '+=260%'),`, `    const cw = wipe('.city__pin', PAPER);
    gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top top', end: () => (isDesk() ? '+=340%' : '+=260%'), scrub: 0.6 } })
      .to({}, { duration: 0.92 })
      .fromTo(cw.el, { clipPath: cw.from }, { clipPath: cw.to, duration: 0.08, ease: 'power2.inOut', immediateRender: false });

    ScrollTrigger.create({
      trigger: sec, start: 'top top',
      end: () => (isDesk() ? '+=340%' : '+=260%'),`);

fs.writeFileSync('js/main.js', s);
console.log('ok');
