// FETSAN Grup — Defne Evleri İkiz Blok Mimari 3D Sahnesi.
// Scroll ilerlemesi (0–1) dışarıdan setProgress ile verilir:
// arazi → 360° mimari teknik çizim (CAD) → temel → kat kat yapı → canlı gün batımı ve altın FETSAN GRUP imzası.
import * as THREE from 'three';

const FH = 3.5;            // kat yüksekliği (11 kat ≈ 38.5 m)
const SLAB_TOP = 0.8;      // temel plağı üst kotu

// Faz sınırları (main.js ile aynı)
export const PHASES = [0, 0.14, 0.32, 0.52, 0.86];
const BUILD0 = 0.52, BUILD_SPAN = 0.32; // Yapı fazı: 0.52 → 0.84 kat kat yükselir

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3);
const lerp = (a, b, t) => a + (b - a) * t;

// Basit kutu birleştirici: [{w,h,d,x,y,z,uvOffX,uvOffY,uvScaleX,uvScaleY}] → tek BufferGeometry (tek draw call)
function mergeBoxes(list) {
  if (!list.length) return new THREE.BufferGeometry();
  const parts = list.map((b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    g.translate(b.x || 0, b.y || 0, b.z || 0);
    if (b.wuv) {
      // Dünya ölçekli UV: taş derzleri her kutuda aynı gerçek ölçüde kalır (sünme yok)
      const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv;
      for (let i = 0; i < P.count; i++) {
        const nx = Math.abs(Nn.getX(i)), ny = Math.abs(Nn.getY(i));
        const px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
        if (ny > 0.5) U.setXY(i, px * b.wuv, pz * b.wuv);
        else if (nx > 0.5) U.setXY(i, pz * b.wuv, py * b.wuv);
        else U.setXY(i, px * b.wuv, py * b.wuv);
      }
    } else if (b.uvScaleX || b.uvScaleY || b.uvOffX || b.uvOffY) {
      const uvAttr = g.attributes.uv;
      const sx = b.uvScaleX ?? 1, sy = b.uvScaleY ?? 1;
      const ox = b.uvOffX ?? 0, oy = b.uvOffY ?? 0;
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * sx + ox, uvAttr.getY(i) * sy + oy);
      }
    }
    return g;
  });
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

// Geometrileri birleştirici (çok parçalı ağaç taçları için)
function mergeGeos(geos) {
  const indexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const count = indexed.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of indexed) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// Gün batımı gökyüzü — 2:1 equirect (ufuk tam ortada), dikişsiz FBM bulutları.
// Aynı doku hem arka plan hem PMREM ortam yansıması (camlar bu gökyüzünü yansıtır) olarak kullanılır.
function skyTexture(mobile, sunDir) {
  const W = mobile ? 512 : 1024, HH = W / 2, HOR = HH / 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = HH;
  const x = c.getContext('2d');
  const img = x.createImageData(W, HH);
  const d = img.data;

  const hash = (i, j) => {
    let h = (i * 374761393 + j * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  // Yatayda periyodik değer gürültüsü (equirect kenarında dikiş olmaz)
  const noise = (px, py, per) => {
    const xi = Math.floor(px), yi = Math.floor(py);
    const xf = px - xi, yf = py - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % per) + per) % per, x1 = (x0 + 1) % per;
    const a = hash(x0, yi), b = hash(x1, yi), e = hash(x0, yi + 1), f = hash(x1, yi + 1);
    return a + (b - a) * u + (e - a) * v + (a - b - e + f) * u * v;
  };
  const fbm = (px, py) => {
    let s = 0, amp = 0.5, fr = 1;
    for (let o = 0; o < 5; o++) { s += amp * noise(px * fr, py * fr, 7 * fr); fr *= 2; amp *= 0.5; }
    return s;
  };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const ramp = (stops, t) => {
    for (let i = 0; i < stops.length - 1; i++) {
      const [ta, ca] = stops[i], [tb, cb] = stops[i + 1];
      if (t <= tb) return mix(ca, cb, (t - ta) / (tb - ta));
    }
    return stops[stops.length - 1][1];
  };
  // e: 0 = ufuk, 1 = zenit
  const skyStops = [
    [0.00, hex('#FFD48E')], [0.05, hex('#F9A75A')], [0.14, hex('#E07852')],
    [0.30, hex('#C0645E')], [0.55, hex('#6A5478')], [1.00, hex('#232B48')],
  ];
  const litStops = [
    [0.00, hex('#FFE4A2')], [0.10, hex('#FFB65E')], [0.30, hex('#F79258')],
    [0.55, hex('#D97C70')], [1.00, hex('#8A6A8A')],
  ];
  const shadowCol = hex('#4A3A58');
  const sunU = Math.atan2(sunDir.z, sunDir.x) / (Math.PI * 2) + 0.5;

  for (let row = 0; row < HH; row++) {
    for (let col = 0; col < W; col++) {
      const k = (row * W + col) * 4;
      let rgb;
      if (row < HOR) {
        const e = 1 - row / HOR;
        const u = col / W;
        let du = Math.abs(u - sunU); du = Math.min(du, 1 - du);
        const sunG = Math.exp(-(du * du) / 0.018) * Math.exp(-e * 7);
        rgb = ramp(skyStops, e);
        rgb = mix(rgb, hex('#FFE6AE'), sunG * 0.45);

        // Bulutlar: yatayda uzamış, ufka yakın katmanlarda yoğun
        const nx = u * 7, ny = (1 - e) * 9;
        const n = fbm(nx, ny * 1.6);
        const band = Math.min(1, e / 0.04) * Math.max(0, 1 - e / 0.72);
        let dens = Math.max(0, Math.min(1, (n - 0.43) / 0.2)) * band;
        if (dens > 0.002) {
          const nUp = fbm(nx, ny * 1.6 - 0.35);
          const lit = Math.max(0, Math.min(1, 0.55 + (n - nUp) * 3.2 + sunG * 0.6));
          const cc = mix(shadowCol, ramp(litStops, e), lit);
          rgb = mix(rgb, cc, dens * 0.92);
        }
      } else {
        // Ufkun altı: koyu sıcak zemin (camlara aşağıdan parlak sarı yansımasın)
        const t = (row - HOR) / HOR;
        rgb = mix(hex('#A86A4E'), hex('#1E1A1C'), Math.min(1, t * 3.5));
      }
      d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

// Gri doğal taş / bazalt cephe kaplaması — 1 doku tekrarı = 2.4 m (dünya ölçekli UV ile kullanılır)
function slateStoneTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  let s = 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#7E8288';
  x.fillRect(0, 0, 256, 256);
  // Plak bazlı ton farkı (4 sıra x 2 plak, şaşırtmalı)
  for (let row = 0; row < 4; row++) {
    for (let k = -1; k < 2; k++) {
      const x0 = k * 128 + (row % 2) * 64;
      const v = Math.floor(108 + r() * 34);
      x.fillStyle = `rgb(${v}, ${v + 3}, ${v + 8})`;
      x.fillRect(x0 + 1, row * 64 + 1, 126, 62);
    }
  }
  for (let i = 0; i < 3200; i++) {
    x.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(10,12,16,0.07)';
    x.fillRect(Math.floor(r() * 256), Math.floor(r() * 256), 2, 2);
  }
  x.strokeStyle = 'rgba(28, 30, 34, 0.55)';
  x.lineWidth = 2;
  for (let row = 0; row < 4; row++) {
    const y = row * 64;
    x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke();
    for (let k = 0; k < 2; k++) {
      const xPos = ((k * 128) + (row % 2) * 64) % 256;
      x.beginPath(); x.moveTo(xPos, y); x.lineTo(xPos, y + 64); x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 4x4 oda atlası — üç ayrı harita üretir:
//  map      : ışığı açık odada oda içi, kapalı odada yansıtıcı cam tonu
//  emissive : yalnız ışığı açık odalar parlar (kapalı odalar siyah → cam gökyüzünü yansıtır)
//  mr       : G = pürüzlülük, B = metaliklik (kapalı oda camı ayna gibi, açık oda camı şeffaf hissi)
function defneRoomAtlas() {
  const S = 1024, N_CELL = 4, cw = S / N_CELL;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const cMap = mk(), cEm = mk(), cMr = mk();
  const xm = cMap.getContext('2d'), xe = cEm.getContext('2d'), xr = cMr.getContext('2d');
  xm.fillStyle = '#121418'; xm.fillRect(0, 0, S, S);
  xe.fillStyle = '#000'; xe.fillRect(0, 0, S, S);
  xr.fillStyle = 'rgb(0, 90, 210)'; xr.fillRect(0, 0, S, S);

  // b = ışık şiddeti; off = ışık kapalı (yaklaşık %35 oda)
  const profiles = [
    { b: 1.00, curtain: 0.36 }, { off: true }, { b: 0.92, curtain: 0.42 }, { b: 0.55, curtain: 0.30 },
    { off: true }, { b: 1.00, curtain: 0.45 }, { b: 0.70, curtain: 0.25 }, { off: true },
    { b: 0.64, curtain: 0.28 }, { b: 0.96, curtain: 0.38 }, { off: true }, { b: 0.86, curtain: 0.40 },
    { off: true, dim: 0.18 }, { b: 0.94, curtain: 0.26 }, { b: 0.80, curtain: 0.44 }, { off: true },
  ];

  function drawLit(x, rx, ry, rw, rh, pr, idx) {
    const bg = x.createLinearGradient(rx, ry, rx, ry + rh);
    bg.addColorStop(0.00, `rgba(255, 236, 190, ${pr.b})`);
    bg.addColorStop(0.30, `rgba(250, 190, 100, ${pr.b * 0.92})`);
    bg.addColorStop(0.72, `rgba(196, 112, 46, ${pr.b * 0.8})`);
    bg.addColorStop(1.00, `rgba(70, 36, 18, ${pr.b * 0.9})`);
    x.fillStyle = '#1A1512'; x.fillRect(rx, ry, rw, rh);
    x.fillStyle = bg; x.fillRect(rx, ry, rw, rh);
    // Tavan spotu / avize halesi
    const ceil = x.createRadialGradient(rx + rw * 0.5, ry + 20, 4, rx + rw * 0.5, ry + 34, rw * 0.6);
    ceil.addColorStop(0, `rgba(255, 252, 230, ${0.9 * pr.b})`);
    ceil.addColorStop(0.6, `rgba(255, 196, 110, ${0.3 * pr.b})`);
    ceil.addColorStop(1, 'rgba(255, 160, 60, 0)');
    x.fillStyle = ceil; x.fillRect(rx, ry, rw, rh * 0.6);
    // Oda yan duvar gölgeleri (derinlik)
    x.fillStyle = 'rgba(30, 16, 8, 0.3)';
    x.fillRect(rx, ry, 22, rh); x.fillRect(rx + rw - 22, ry, 22, rh);
    // Tül perdeler
    const cl = rw * pr.curtain;
    for (let s = 0; s < cl; s += 6) {
      x.fillStyle = `rgba(255, 244, 222, ${(0.16 + 0.1 * Math.sin(s * 0.45)) * pr.b})`;
      x.fillRect(rx + s, ry, 4, rh);
    }
    // Mobilya silüeti
    x.fillStyle = 'rgba(24, 16, 12, 0.6)';
    x.fillRect(rx + rw * 0.2, ry + rh * 0.74, rw * 0.46, rh * 0.26);
    if (idx % 3 === 0) { x.beginPath(); x.arc(rx + rw * 0.78, ry + rh * 0.66, 16, 0, Math.PI * 2); x.fill(); }
  }

  for (let row = 0; row < N_CELL; row++) {
    for (let col = 0; col < N_CELL; col++) {
      const idx = row * N_CELL + col;
      const pr = profiles[idx];
      const pad = 10;
      const rx = col * cw + pad, ry = row * cw + pad, rw = cw - pad * 2, rh = cw - pad * 2;
      if (pr.off) {
        // Kapalı oda: koyu iç + metalik yansıtıcı cam (renk = yansıma tonu)
        const g = xm.createLinearGradient(rx, ry, rx, ry + rh);
        g.addColorStop(0, '#A49AA4'); g.addColorStop(1, '#5C6170');
        xm.fillStyle = g; xm.fillRect(rx, ry, rw, rh);
        if (pr.dim) {
          const lg = xe.createRadialGradient(rx + rw * 0.7, ry + rh * 0.62, 2, rx + rw * 0.7, ry + rh * 0.62, rw * 0.35);
          lg.addColorStop(0, `rgba(255, 190, 110, ${pr.dim * 3})`); lg.addColorStop(1, 'rgba(0,0,0,0)');
          xe.fillStyle = lg; xe.fillRect(rx, ry, rw, rh);
        }
        xr.fillStyle = 'rgb(0, 38, 215)'; xr.fillRect(rx, ry, rw, rh);
      } else {
        drawLit(xm, rx, ry, rw, rh, pr, idx);
        drawLit(xe, rx, ry, rw, rh, pr, idx);
        xr.fillStyle = 'rgb(0, 26, 30)'; xr.fillRect(rx, ry, rw, rh);
      }
      // Siyah alüminyum doğrama (3 kanat + Fransız balkon kaydı) — tüm haritalarda
      for (const [x, colr] of [[xm, '#14161A'], [xe, '#000'], [xr, 'rgb(0, 90, 210)']]) {
        x.fillStyle = colr;
        x.fillRect(rx, ry, rw, 6); x.fillRect(rx, ry + rh - 6, rw, 6);
        x.fillRect(rx, ry, 6, rh); x.fillRect(rx + rw - 6, ry, 6, rh);
        x.fillRect(rx + Math.round(rw * 0.33) - 3, ry, 6, rh);
        x.fillRect(rx + Math.round(rw * 0.67) - 3, ry, 6, rh);
        x.fillRect(rx, ry + Math.round(rh * 0.64), rw, 4);
      }
    }
  }
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(cMap, true), emissive: tex(cEm, true), mr: tex(cMr, false), lit: profiles.map((p) => !p.off) };
}


// Zemin kat dükkan iç mekân arka duvarları — 4 farklı dükkan (kafe, fırın, butik, lobi), 2048x512 atlas.
// Camın 3.2 m gerisindeki gerçek iç hacmin arka duvarına kaplanır; ön planda 3D tezgâh, lamba ve doğrama vardır.
function podiumStorefrontTexture() {
  const W = 2048, Hc = 512, CW = W / 4;
  const c = document.createElement('canvas');
  c.width = W; c.height = Hc;
  const x = c.getContext('2d');
  let s = 21;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;

  const wallTone = ['#6B4128', '#7A5232', '#5E4A3E', '#77695A'];
  for (let k = 0; k < 4; k++) {
    const x0 = k * CW;
    // Arka duvar: sıcak gizli LED ile tavandan aşağı yıkanan ışık
    const g = x.createLinearGradient(0, 0, 0, Hc);
    g.addColorStop(0, '#FFE2A8'); g.addColorStop(0.18, '#E7A866'); g.addColorStop(0.62, wallTone[k]); g.addColorStop(1, '#2A1C14');
    x.fillStyle = g; x.fillRect(x0, 0, CW, Hc);
    // Duvar spotlarının ışık konileri
    for (let i = 0; i < 4; i++) {
      const lx = x0 + CW * (i + 0.5) / 4;
      const cg = x.createRadialGradient(lx, 30, 4, lx, 110, 150);
      cg.addColorStop(0, 'rgba(255,246,214,0.85)'); cg.addColorStop(1, 'rgba(255,200,120,0)');
      x.fillStyle = cg; x.fillRect(lx - 150, 0, 300, 300);
    }
    x.fillStyle = 'rgba(20,12,8,0.35)'; x.fillRect(x0, 0, 3, Hc);

    if (k === 0 || k === 1) {
      // Kafe / fırın: ahşap raflar, ürünler, ışıklı menü panosu
      x.fillStyle = 'rgba(40,24,14,0.9)';
      x.fillRect(x0 + 40, 70, 150, 92);
      x.fillStyle = 'rgba(255,240,205,0.9)';
      for (let l = 0; l < 6; l++) x.fillRect(x0 + 52, 82 + l * 13, 60 + r() * 60, 4);
      for (let sh = 0; sh < 3; sh++) {
        const y = 210 + sh * 70;
        x.fillStyle = '#4A2C18'; x.fillRect(x0 + 230, y, 250, 9);
        for (let it = 0; it < 11; it++) {
          const ix = x0 + 238 + it * 22, ih = 18 + r() * 24;
          x.fillStyle = k === 1 ? `hsl(${28 + r() * 12}, ${55 + r() * 20}%, ${42 + r() * 18}%)` : `hsl(${r() * 360}, 35%, ${38 + r() * 25}%)`;
          if (k === 1) { x.beginPath(); x.ellipse(ix + 9, y - 10, 10, 9, 0, 0, Math.PI * 2); x.fill(); }
          else x.fillRect(ix, y - ih, 14, ih);
        }
      }
    } else if (k === 2) {
      // Butik: askılı giysi rafları ve ışıklı vitrin nişleri
      for (let n = 0; n < 3; n++) {
        const nx = x0 + 40 + n * 155;
        x.fillStyle = 'rgba(255,236,200,0.55)'; x.fillRect(nx, 80, 120, 240);
        x.fillStyle = '#2B2420'; x.fillRect(nx + 6, 120, 108, 4);
        for (let it = 0; it < 7; it++) {
          x.fillStyle = `hsl(${(n * 70 + it * 25) % 360}, 30%, ${30 + r() * 30}%)`;
          x.fillRect(nx + 10 + it * 15, 124, 11, 90 + r() * 50);
        }
      }
    } else {
      // Lobi: mermer kaplama, ışıklı sanat panosu, asansör kapıları
      x.fillStyle = 'rgba(235,225,210,0.5)'; x.fillRect(x0, 60, CW, 330);
      for (let v = 0; v < 26; v++) {
        x.strokeStyle = `rgba(120,100,80,${0.08 + r() * 0.12})`; x.lineWidth = 1 + r() * 2;
        x.beginPath(); x.moveTo(x0 + r() * CW, 60); x.bezierCurveTo(x0 + r() * CW, 160, x0 + r() * CW, 260, x0 + r() * CW, 390); x.stroke();
      }
      x.fillStyle = '#B88A4A'; x.fillRect(x0 + 60, 120, 170, 120);
      x.fillStyle = '#2A2622'; x.fillRect(x0 + 300, 150, 70, 240); x.fillRect(x0 + 390, 150, 70, 240);
      x.fillStyle = 'rgba(255,220,160,0.7)'; x.fillRect(x0 + 300, 140, 160, 4);
    }
    // İnsan silüetleri (yumuşak, odak dışı)
    for (let pp = 0; pp < 2 + (k % 2); pp++) {
      const px = x0 + 60 + r() * (CW - 120), ph = 150 + r() * 40;
      x.fillStyle = 'rgba(24,16,12,0.55)';
      x.beginPath(); x.ellipse(px, Hc - ph - 6, 13, 16, 0, 0, Math.PI * 2); x.fill();
      x.fillRect(px - 20, Hc - ph + 10, 40, ph - 10);
    }
    // Zemin süpürgelik
    x.fillStyle = 'rgba(18,12,8,0.8)'; x.fillRect(x0, Hc - 28, CW, 28);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Dükkan tavanı: sıcak opal tavan + gömme downlight ızgarası
function shopCeilingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#6A4A32'; x.fillRect(0, 0, 128, 128);
  for (const [px, py] of [[32, 32], [96, 32], [32, 96], [96, 96]]) {
    const g = x.createRadialGradient(px, py, 2, px, py, 30);
    g.addColorStop(0, '#FFF8E0'); g.addColorStop(0.25, '#FFD9A0'); g.addColorStop(1, 'rgba(106,74,50,0)');
    x.fillStyle = g; x.fillRect(px - 32, py - 32, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}


// Zemin: 64 m'lik kent ızgarası — ada içleri canlı yeşil çim peyzajlı, çevresi taş kaldırım ve gün batımı yansımalı asfalt
const GRID = 64;
function streetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  const px = 512 / GRID;
  const road = 14 * px, walk = 3.2 * px, mid = 256;

  // Ada içi doğal yeşil peyzaj çimi
  const lg = x.createRadialGradient(mid, mid, 12, mid, mid, 260);
  lg.addColorStop(0, '#3D6E2E');
  lg.addColorStop(1, '#2B5220');
  x.fillStyle = lg;
  x.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 1200; i++) {
    const gx = (i * 73) % 512, gy = (i * 137) % 512;
    x.fillStyle = i % 2 ? 'rgba(110, 165, 78, 0.14)' : 'rgba(22, 48, 16, 0.15)';
    x.fillRect(gx, gy, 3, 3);
  }

  // Açık bazalt/traverten kaldırım
  x.fillStyle = '#B8B3AA';
  x.fillRect(0, mid - road / 2 - walk, 512, road + walk * 2);
  x.fillRect(mid - road / 2 - walk, 0, road + walk * 2, 512);

  // Koyu ıslak asfalt yol (gün batımı yansımalı)
  x.fillStyle = '#25272C';
  x.fillRect(0, mid - road / 2, 512, road);
  x.fillRect(mid - road / 2, 0, road, 512);

  // Yol şeritleri ve sıcak ışık izleri
  x.fillStyle = 'rgba(248, 224, 184, 0.42)';
  for (let k = 0; k < 512; k += 32) {
    if (Math.abs(k + 8 - mid) > road / 2 + 8) {
      x.fillRect(k, mid - 1, 16, 2);
      x.fillRect(mid - 1, k, 2, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Ana site parseli için canlı biçilmiş çim ve yürüyüş yolu dokusu
function courtyardLawnTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(256, 256, 30, 256, 256, 260);
  g.addColorStop(0, '#467D34');
  g.addColorStop(0.7, '#366628');
  g.addColorStop(1, '#284E1E');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);

  for (let s = 0; s < 512; s += 16) {
    x.fillStyle = (s / 16) % 2 === 0 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.035)';
    x.fillRect(0, s, 512, 8);
  }
  x.strokeStyle = '#D8D3C8';
  x.lineWidth = 20;
  x.strokeRect(18, 18, 476, 476);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#181A1E'; x.fillRect(0, 0, 64, 128);
  for (let r = 0; r < 32; r++) {
    for (let k = 0; k < 8; k++) {
      const v = Math.random();
      if (v < 0.5) continue;
      const a = v > 0.88 ? 0.9 : v > 0.68 ? 0.5 : 0.22;
      x.fillStyle = `rgba(255, 204, 128, ${a})`;
      x.fillRect(k * 8 + 2, r * 4 + 1, 4, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Organik ağaç tacı: yüksek alt bölümlü, girintili-çıkıntılı yaprak salkımları + yumuşak (elipsoid) normaller.
// Köşeli "oyun küresi" görünümü yerine gün batımında yumuşak silüet verir.
function buildRealisticCanopyGeo(detail = 2) {
  const clusters = [
    [0.0, 3.3, 0.0, 1.25, 1.05, 1.25],
    [-0.75, 2.8, 0.55, 0.95, 0.85, 0.95],
    [0.80, 2.9, 0.45, 0.92, 0.82, 0.92],
    [0.15, 2.7, -0.80, 0.98, 0.85, 0.95],
    [-0.65, 3.1, -0.60, 0.88, 0.80, 0.88],
    [0.65, 3.5, -0.35, 0.85, 0.78, 0.85],
    [-0.45, 3.8, 0.25, 0.82, 0.75, 0.82],
    [0.0, 4.25, 0.0, 0.78, 0.72, 0.78],
    [0.42, 2.45, 0.72, 0.74, 0.65, 0.74],
  ];
  const geos = clusters.map(([cx, cy, cz, sx, sy, sz], idx) => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const P = g.attributes.position, Nn = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
      const bump = 1
        + 0.15 * Math.sin(x * 7.1 + idx) * Math.sin(y * 6.3 + idx * 1.7) * Math.sin(z * 5.7 + idx * 0.9)
        + 0.07 * Math.sin((x - y + z) * 13.0 + idx * 2.3);
      P.setXYZ(i, x * bump * sx + cx, y * bump * sy + cy, z * bump * sz + cz);
      const nx = x / sx, ny = y / sy, nz = z / sz, nl = Math.hypot(nx, ny, nz);
      Nn.setXYZ(i, nx / nl, ny / nl, nz / nl);
    }
    return g;
  });
  return mergeGeos(geos);
}


// Hafif HDR bloom (masaüstü): sahne MSAA'lı HalfFloat hedefe çizilir, parlak bölgeler 4 seviyede
// bulanıklaştırılır ve ton eşleme ile birlikte ekrana birleştirilir. Tabela, vitrin ve açık oda ışıkları hale yayar.
function createBloom(renderer, { strength = 0.6, threshold = 1.0 } = {}) {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(tri);
  quad.frustumCulled = false;
  const fsScene = new THREE.Scene();
  fsScene.add(quad);
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const vertexShader = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const base = { vertexShader, depthTest: false, depthWrite: false };

  const sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true });
  const LV = 4;
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false };
  const A = [], B = [];
  for (let i = 0; i < LV; i++) { A.push(new THREE.WebGLRenderTarget(1, 1, rtOpts)); B.push(new THREE.WebGLRenderTarget(1, 1, rtOpts)); }

  const bright = new THREE.ShaderMaterial({
    ...base, toneMapped: false,
    uniforms: { tDiffuse: { value: null }, threshold: { value: threshold } },
    fragmentShader: `uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b));
      float k = smoothstep(threshold, threshold * 1.6, l); gl_FragColor = vec4(min(c * k, vec3(6.0)), 1.0); }`,
  });
  const blur = new THREE.ShaderMaterial({
    ...base, toneMapped: false,
    uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
      void main(){ vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270;
      s += (texture2D(tDiffuse, vUv + dir * 1.3846154).rgb + texture2D(tDiffuse, vUv - dir * 1.3846154).rgb) * 0.3162162;
      s += (texture2D(tDiffuse, vUv + dir * 3.2307692).rgb + texture2D(tDiffuse, vUv - dir * 3.2307692).rgb) * 0.0702703;
      gl_FragColor = vec4(s, 1.0); }`,
  });
  const comp = new THREE.ShaderMaterial({
    ...base, toneMapped: true,
    uniforms: {
      tScene: { value: sceneRT.texture }, strength: { value: strength },
      b0: { value: A[0].texture }, b1: { value: A[1].texture }, b2: { value: A[2].texture }, b3: { value: A[3].texture },
    },
    fragmentShader: `uniform sampler2D tScene, b0, b1, b2, b3; uniform float strength; varying vec2 vUv;
      void main(){
        vec3 bl = texture2D(b0, vUv).rgb * 0.30 + texture2D(b1, vUv).rgb * 0.30 + texture2D(b2, vUv).rgb * 0.25 + texture2D(b3, vUv).rgb * 0.15;
        vec2 q = vUv - 0.5; float vig = 1.0 - dot(q, q) * 0.55;
        gl_FragColor = vec4((texture2D(tScene, vUv).rgb + bl * strength) * vig, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };
  return {
    setSize(w, h) {
      sceneRT.setSize(w, h);
      for (let i = 0; i < LV; i++) {
        const s = 2 << i;
        A[i].setSize(Math.max(1, Math.round(w / s)), Math.max(1, Math.round(h / s)));
        B[i].setSize(Math.max(1, Math.round(w / s)), Math.max(1, Math.round(h / s)));
      }
    },
    render(scene, camera) {
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      bright.uniforms.tDiffuse.value = sceneRT.texture;
      pass(bright, A[0]);
      for (let i = 0; i < LV; i++) {
        const src = i === 0 ? A[0] : A[i - 1];
        blur.uniforms.tDiffuse.value = src.texture;
        blur.uniforms.dir.value.set(1 / A[i].width, 0);
        pass(blur, B[i]);
        blur.uniforms.tDiffuse.value = B[i].texture;
        blur.uniforms.dir.value.set(0, 1 / A[i].height);
        pass(blur, A[i]);
      }
      pass(comp, null);
    },
    dispose() {
      sceneRT.dispose(); A.forEach((r) => r.dispose()); B.forEach((r) => r.dispose());
      bright.dispose(); blur.dispose(); comp.dispose(); tri.dispose();
    },
  };
}

export async function createCity(host, { mobile = false }) {
  // N = 11 kat: i=0..1 (2 kat ticari vitrin + kafe teras podyumu), i=2..9 (8 konut katı = 4 çift C-çerçeve), i=10 (çatı teras + alınlık)
  const N = 11;
  const BW = 24, BD = 20;
  const BLOCKS = [
    { x: 5.5, y: 0, z: 6.5 },     // A Blok (Ön plandaki ana blok)
    { x: -19.5, y: -1.0, z: -14 } // B Blok (Sol arkadaki ikiz blok)
  ];

  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75, 2000 / Math.max(1, host.clientWidth));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const SUN_POS = new THREE.Vector3(-72, 46, 68);
  const scene = new THREE.Scene();
  const skyTex = skyTexture(mobile, SUN_POS.clone().normalize());
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xD8946C, mobile ? 170 : 220, mobile ? 560 : 720);

  // Camlar gri stüdyo kutusunu değil, gerçek gün batımı gökyüzünü yansıtır
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(skyTex);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(mobile ? 46 : 36, 1, 0.5, 1200);

  // Alçak açılı sıcak gün batımı güneşi (#FFB070) + akşamüstü gökyüzü yarımküre ışığı + cephe dolgu ışığı
  const hemi = new THREE.HemisphereLight(0xB4BCE0, 0x4A3E34, 0.92);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xFFB474, 2.45);
  sun.position.copy(SUN_POS);
  if (!mobile) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -54; s.right = 44; s.top = 58; s.bottom = -12; s.near = 10; s.far = 250;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.4;
  }
  scene.add(sun);

  // Sağ cepheyi yumuşak aydınlatan akşamüstü dolgu ışığı (iki cephe arasında doğal 3D kontrast)
  const fillLight = new THREE.DirectionalLight(0x9AB4DC, 0.65);
  fillLight.position.set(65, 35, 40);
  scene.add(fillLight);

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const atlas = defneRoomAtlas();
  for (const t of [atlas.map, atlas.emissive, atlas.mr]) t.anisotropy = maxAniso;
  const shopTex = podiumStorefrontTexture();
  shopTex.anisotropy = maxAniso;
  const shopCeilTex = shopCeilingTexture();
  const stoneTex = slateStoneTexture();
  stoneTex.anisotropy = maxAniso;
  const lawnTex = courtyardLawnTexture();
  lawnTex.anisotropy = maxAniso;

  // Malzemeler (Defne Evleri gerçekçi mimari paleti)
  const M = {
    ground: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
    soil: new THREE.MeshStandardMaterial({ map: lawnTex, color: 0xffffff, roughness: 0.86, transparent: true, opacity: 0 }),
    whiteStone: new THREE.MeshStandardMaterial({ color: 0xF2EFE9, roughness: 0.42, metalness: 0.04 }),
    greyStone: new THREE.MeshStandardMaterial({
      map: stoneTex, bumpMap: stoneTex, bumpScale: 0.6,
      color: 0xB4B8BE, roughness: 0.82, metalness: 0.0,
    }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8C5232, roughness: 0.6, metalness: 0.0 }),
    // Açık odalar içten yanar; kapalı odaların camı metalik/pürüzsüz → gün batımı gökyüzünü yansıtır
    window: new THREE.MeshStandardMaterial({
      map: atlas.map, color: 0xffffff,
      metalness: 1, metalnessMap: atlas.mr, roughness: 1, roughnessMap: atlas.mr,
      emissive: new THREE.Color(0xFFB45C), emissiveMap: atlas.emissive, emissiveIntensity: 1.0,
      envMapIntensity: 1.15,
    }),
    // Dükkan arka duvarı (iç mekân) — camın 3.2 m gerisinde
    shopWindow: new THREE.MeshStandardMaterial({
      map: shopTex, color: 0xffffff, roughness: 0.85, metalness: 0,
      emissive: new THREE.Color(0xFFC77A), emissiveMap: shopTex, emissiveIntensity: 1.0,
      envMapIntensity: 2.0,
    }),
    // Vitrin camı: yarı saydam, pürüzsüz, gün batımını yansıtır; içerisi derinlikle görünür
    shopGlass: new THREE.MeshStandardMaterial({
      color: 0xC4CCD4, metalness: 1, roughness: 0.04, envMapIntensity: 1.8,
      transparent: true, opacity: 0.22, depthWrite: false,
    }),
    shopCeil: new THREE.MeshStandardMaterial({
      map: shopCeilTex, color: 0xffffff, roughness: 0.9,
      emissive: new THREE.Color(0xFFD9A0), emissiveMap: shopCeilTex, emissiveIntensity: 1.1,
    }),
    shopFloor: new THREE.MeshStandardMaterial({ color: 0x6E5C4C, roughness: 0.16, metalness: 0.1 }),
    sconce: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xFFE2A0).multiplyScalar(3.2) }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x1A1C20, metalness: 0.8, roughness: 0.35 }),
    railing: new THREE.MeshStandardMaterial({ color: 0xDCEAF4, metalness: 0.35, roughness: 0.05, transparent: true, opacity: 0.38 }),
    blueprint: new THREE.LineBasicMaterial({ color: 0xF6EFE4, transparent: true, opacity: 0.72 }),
  };

  // ---- Zemin ve parsel ----
  const street = streetTexture();
  street.repeat.set(36, 36);
  street.anisotropy = maxAniso;
  M.ground.map = street;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID * 36, GRID * 36), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const PLOT_X = 33, PLOT_Z = 27, CX = -6, CZ = -3;
  const soil = new THREE.Mesh(new THREE.PlaneGeometry(PLOT_X * 2, PLOT_Z * 2), M.soil);
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(CX, 0.03, CZ);
  soil.receiveShadow = true;
  scene.add(soil);

  // Parsel çevre bahçe duvarı ve sarı bahçe/sütun lambaları (fotoğraftaki sokak kenarı detayı)
  const gardenWallGroup = new THREE.Group();
  const wallBoxes = [
    { w: PLOT_X * 2, h: 0.9, d: 0.45, x: CX, y: 0.45, z: CZ + PLOT_Z - 0.5 },
    { w: 0.45, h: 0.9, d: PLOT_Z * 2, x: CX - PLOT_X + 0.5, y: 0.45, z: CZ },
  ];
  const lanternBoxes = [];
  for (let k = -3; k <= 3; k++) {
    const px = CX + k * 9.5;
    wallBoxes.push({ w: 0.75, h: 1.45, d: 0.75, x: px, y: 0.72, z: CZ + PLOT_Z - 0.5 });
    lanternBoxes.push({ w: 0.42, h: 0.42, d: 0.42, x: px, y: 1.65, z: CZ + PLOT_Z - 0.5 });
  }
  for (let k = -2; k <= 2; k++) {
    const pz = CZ + k * 9.5;
    wallBoxes.push({ w: 0.75, h: 1.45, d: 0.75, x: CX - PLOT_X + 0.5, y: 0.72, z: pz });
    lanternBoxes.push({ w: 0.42, h: 0.42, d: 0.42, x: CX - PLOT_X + 0.5, y: 1.65, z: pz });
  }
  gardenWallGroup.add(
    new THREE.Mesh(mergeBoxes(wallBoxes), M.whiteStone),
    new THREE.Mesh(mergeBoxes(lanternBoxes), M.sconce)
  );
  gardenWallGroup.visible = false;
  scene.add(gardenWallGroup);

  // Parsel sınırı: zemine serilmiş ince şeritler
  const corners = [
    [CX - PLOT_X, CZ - PLOT_Z],
    [CX + PLOT_X, CZ - PLOT_Z],
    [CX + PLOT_X, CZ + PLOT_Z],
    [CX - PLOT_X, CZ + PLOT_Z],
  ];
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xF4EFE6 });
  const strips = new THREE.Group();
  const stripDefs = [
    { x: corners[0][0], z: corners[0][1], len: PLOT_X * 2, rot: 0 },
    { x: corners[1][0], z: corners[1][1], len: PLOT_Z * 2, rot: -Math.PI / 2 },
    { x: corners[2][0], z: corners[2][1], len: PLOT_X * 2, rot: Math.PI },
    { x: corners[3][0], z: corners[3][1], len: PLOT_Z * 2, rot: Math.PI / 2 },
  ];
  for (const sd of stripDefs) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(sd.len, 0.06, 0.45).translate(sd.len / 2, 0, 0), stripMat);
    s.position.set(sd.x, 0.06, sd.z);
    s.rotation.y = sd.rot;
    s.scale.x = 0.0001;
    strips.add(s);
  }
  scene.add(strips);

  const stakes = new THREE.Group();
  for (const [x, z] of corners) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.6, 0.28), M.whiteStone);
    st.position.set(x, 0.8, z);
    stakes.add(st);
  }
  scene.add(stakes);

  // ---- Temel: Mühendislik sırasıyla 7 adım ----
  // 1 Kazı + İksa (fore kazık perde, başlık kirişi, kuşak kirişi, öngermeli ankraj)
  // 2 Fore kazıklar (sondaj makinesi ile, başlarında filiz donatısı)
  // 3 Grobeton  4 Su yalıtımı  5 Radye donatısı (alt+üst ızgara, perde filizleri)
  // 6 Radye beton dökümü  7 Bodrum perdeleri + kolonlar + zemin kat döşemesi
  // Çukur, zemini stencil ile "keserek" gösterilir: maske düzlemi stencil=1 yazar, zemin orada çizilmez.
  const fdum = new THREE.Object3D();
  const DEPTH = 6.0;                       // bodrum kazı derinliği
  const PW = BW + 4.4, PD = BD + 4.4;      // kazı ölçüsü
  const IW = PW - 1.5, ID = PD - 1.5;      // iksa iç yüzü arası net alan
  const RAFT = 1.6;                        // radye kalınlığı
  const PILE_L = 14;                       // görünür kazık boyu (sondajla zemine iner)
  const FLOOR_Y = -DEPTH;

  const strataTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const x = c.getContext('2d');
    const bands = [['#5A4232', 0], ['#6E5038', 0.12], ['#7B5C3E', 0.3], ['#8A6A48', 0.52], ['#6B5544', 0.74], ['#59483C', 1]];
    const g = x.createLinearGradient(0, 0, 0, 256);
    for (const [cl, t] of bands) g.addColorStop(t, cl);
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 900; i++) {
      x.fillStyle = r() > 0.5 ? 'rgba(255,235,200,0.08)' : 'rgba(20,12,6,0.12)';
      x.fillRect(Math.floor(r() * 64), Math.floor(r() * 256), 2, 1 + Math.floor(r() * 2));
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 1);
    return t;
  })();

  const FM = {
    pit: new THREE.MeshStandardMaterial({ map: strataTex, roughness: 0.95, side: THREE.BackSide }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xA9A69F, roughness: 0.82 }),
    freshConcrete: new THREE.MeshStandardMaterial({ color: 0x8E8C87, roughness: 0.3 }),
    lean: new THREE.MeshStandardMaterial({ color: 0xBDB8AE, roughness: 0.9 }),
    membrane: new THREE.MeshStandardMaterial({ color: 0x1F2329, roughness: 0.38, metalness: 0.15 }),
    rebar: new THREE.MeshStandardMaterial({ color: 0x8A4A26, roughness: 0.55, metalness: 0.55 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x3C4248, roughness: 0.45, metalness: 0.7 }),
    rig: new THREE.MeshStandardMaterial({ color: 0xE0A21C, roughness: 0.5, metalness: 0.2 }),
    mask: new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
    }),
  };
  for (const m of [M.ground, M.soil]) {
    m.stencilWrite = true; m.stencilRef = 1;
    m.stencilFunc = THREE.NotEqualStencilFunc;
    m.stencilZPass = THREE.KeepStencilOp; m.stencilFail = THREE.KeepStencilOp;
  }

  const fnd = BLOCKS.map((blk) => {
    const g = new THREE.Group();
    g.position.set(blk.x, 0, blk.z);
    scene.add(g);
    const shadow = (m) => { m.castShadow = m.receiveShadow = !mobile; return m; };

    // Zemin kesme maskesi (stencil)
    const mask = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD).rotateX(-Math.PI / 2), FM.mask);
    mask.position.y = 0.08;
    mask.renderOrder = -10;
    g.add(mask);

    // 1. Kazı çukuru (iç yüzleri görünen kutu; derinliği kazıyla artar)
    const pit = new THREE.Mesh(new THREE.BoxGeometry(PW, DEPTH, PD).translate(0, -DEPTH / 2, 0), FM.pit);
    pit.receiveShadow = !mobile;
    g.add(pit);

    // İksa: sekant fore kazık perde (her 0.75 m), başlık kirişi, 2 sıra kuşak kirişi + ankraj başlıkları
    const shoring = new THREE.Group();
    g.add(shoring);
    const wallPts = [];
    for (let u = -PW / 2 + 0.6; u <= PW / 2 - 0.6; u += 0.75) { wallPts.push([u, PD / 2 - 0.35], [u, -PD / 2 + 0.35]); }
    for (let v = -PD / 2 + 1.1; v <= PD / 2 - 1.1; v += 0.75) { wallPts.push([PW / 2 - 0.35, v], [-PW / 2 + 0.35, v]); }
    const secant = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.4, DEPTH + 1.5, 10).translate(0, -(DEPTH + 1.5) / 2, 0), FM.concrete, wallPts.length);
    wallPts.forEach(([u, v], k) => { fdum.position.set(u, 0, v); fdum.rotation.set(0, 0, 0); fdum.scale.set(1, 1, 1); fdum.updateMatrix(); secant.setMatrixAt(k, fdum.matrix); });
    shoring.add(shadow(secant));
    const ringBoxes = (y, h, t, inset) => [
      { w: PW - inset * 2, h, d: t, y, z: PD / 2 - inset },
      { w: PW - inset * 2, h, d: t, y, z: -(PD / 2 - inset) },
      { w: t, h, d: PD - inset * 2, y, x: PW / 2 - inset },
      { w: t, h, d: PD - inset * 2, y, x: -(PW / 2 - inset) },
    ];
    shoring.add(shadow(new THREE.Mesh(mergeBoxes(ringBoxes(-0.4, 0.8, 1.0, 0.4)), FM.concrete)));
    const waler = [], anchors = [];
    for (const wy of [-2.2, -4.2]) {
      waler.push(...ringBoxes(wy, 0.42, 0.3, 0.92));
      for (let u = -PW / 2 + 2; u <= PW / 2 - 2; u += 2.4) {
        anchors.push({ w: 0.36, h: 0.36, d: 0.3, x: u, y: wy, z: PD / 2 - 1.2 }, { w: 0.36, h: 0.36, d: 0.3, x: u, y: wy, z: -(PD / 2 - 1.2) });
      }
      for (let v = -PD / 2 + 2; v <= PD / 2 - 2; v += 2.4) {
        anchors.push({ w: 0.3, h: 0.36, d: 0.36, x: PW / 2 - 1.2, y: wy, z: v }, { w: 0.3, h: 0.36, d: 0.36, x: -(PW / 2 - 1.2), y: wy, z: v });
      }
    }
    shoring.add(new THREE.Mesh(mergeBoxes(waler), FM.steel), new THREE.Mesh(mergeBoxes(anchors), FM.rig));

    // 2. Fore kazıklar: 5 x 4 = 20 adet; sondaj makinesi kazıktan kazığa ilerler
    const pilePts = [];
    for (let k = 0; k < 4; k++) for (let i = 0; i < 5; i++) {
      const ii = k % 2 ? 4 - i : i; // yılan sırası (makine en kısa yoldan ilerler)
      pilePts.push([(ii - 2) * 4.9, (k - 1.5) * 5.6]);
    }

    const piles = pilePts.map(([u, v]) => {
      const m = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, PILE_L, 14).translate(0, -PILE_L / 2, 0), FM.concrete));
      m.position.set(u, FLOOR_Y + PILE_L, v);
      m.visible = false;
      g.add(m);
      return m;
    });
    const starterGeo = mergeBoxes([0, 1, 2, 3, 4, 5].map((q) => {
      const a = (q / 6) * Math.PI * 2;
      return { w: 0.05, h: 1.1, d: 0.05, x: Math.cos(a) * 0.3, y: 0.55, z: Math.sin(a) * 0.3 };
    }));
    const starters = new THREE.InstancedMesh(starterGeo, FM.rebar, pilePts.length);
    pilePts.forEach(([u, v], k) => { fdum.position.set(u, FLOOR_Y + 0.55, v); fdum.rotation.set(0, 0, 0); fdum.scale.set(1, 1, 1); fdum.updateMatrix(); starters.setMatrixAt(k, fdum.matrix); });
    starters.count = 0;
    g.add(starters);

    const rig = new THREE.Group();
    rig.add(
      shadow(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 4.2).translate(0, 0.35, 0), FM.steel)),        // palet
      shadow(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 3.0).translate(0, 1.6, 0.4), FM.rig)),          // kabin + motor
      shadow(new THREE.Mesh(new THREE.BoxGeometry(0.45, 17, 0.45).translate(0, 8.5, -1.4), FM.rig)),         // direk
      shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 9, 8).translate(0, 4.5, -1.4), FM.steel))   // kelly bar / burgu
    );
    rig.visible = false;
    g.add(rig);

    // 3. Grobeton (10 cm) — soldan sağa dökülür
    const lean = shadow(new THREE.Mesh(new THREE.BoxGeometry(IW, 0.12, ID).translate(IW / 2, 0.06, 0), FM.lean));
    lean.position.set(-IW / 2, FLOOR_Y, 0);
    g.add(lean);

    // 4. Su yalıtımı: tabanda membran + perde yüzlerinde dikey membran
    const memFloor = shadow(new THREE.Mesh(new THREE.BoxGeometry(IW, 0.04, ID).translate(0, 0, ID / 2), FM.membrane));
    memFloor.position.set(0, FLOOR_Y + 0.14, -ID / 2);
    g.add(memFloor);
    const memWalls = new THREE.Mesh(mergeBoxes([
      { w: IW, h: DEPTH, d: 0.05, y: DEPTH / 2, z: ID / 2 }, { w: IW, h: DEPTH, d: 0.05, y: DEPTH / 2, z: -ID / 2 },
      { w: 0.05, h: DEPTH, d: ID, y: DEPTH / 2, x: IW / 2 }, { w: 0.05, h: DEPTH, d: ID, y: DEPTH / 2, x: -IW / 2 },
    ]), FM.membrane);
    memWalls.position.y = FLOOR_Y;
    g.add(memWalls);

    // 5. Radye donatısı: alt + üst ızgara ve perde filizleri (sırayla belirir)
    const bars = [];
    const S = 0.75, RW = IW - 0.6, RD = ID - 0.6;
    for (const ly of [FLOOR_Y + 0.32, FLOOR_Y + RAFT - 0.12]) {
      for (let u = -RW / 2; u <= RW / 2 + 1e-3; u += S) bars.push([u, ly + 0.035, 0, 0.06, 0.06, RD]);
      for (let v = -RD / 2; v <= RD / 2 + 1e-3; v += S) bars.push([0, ly - 0.035, v, RW, 0.06, 0.06]);
    }
    for (let u = -RW / 2; u <= RW / 2 + 1e-3; u += S) for (const sv of [-1, 1]) bars.push([u, FLOOR_Y + RAFT + 0.9, sv * (RD / 2 - 0.15), 0.05, 1.8, 0.05]);
    for (let v = -RD / 2 + S; v <= RD / 2 - S + 1e-3; v += S) for (const su of [-1, 1]) bars.push([su * (RW / 2 - 0.15), FLOOR_Y + RAFT + 0.9, v, 0.05, 1.8, 0.05]);
    const rebar = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), FM.rebar, bars.length);
    bars.forEach(([x, y, z, w, h, d], k) => { fdum.position.set(x, y, z); fdum.rotation.set(0, 0, 0); fdum.scale.set(w, h, d); fdum.updateMatrix(); rebar.setMatrixAt(k, fdum.matrix); });
    rebar.count = 0;
    g.add(rebar);

    // 6. Radye beton (160 cm) — aşağıdan yukarı dolar, taze beton parlaklığı zamanla matlaşır
    const raft = shadow(new THREE.Mesh(new THREE.BoxGeometry(IW - 0.1, RAFT, ID - 0.1).translate(0, RAFT / 2, 0), FM.freshConcrete));
    raft.position.y = FLOOR_Y + 0.16;
    g.add(raft);

    // 7. Bodrum perdeleri (40 cm) + kolonlar
    const wallH = DEPTH - RAFT - 0.16;
    const walls = shadow(new THREE.Mesh(mergeBoxes([
      { w: IW - 0.1, h: wallH, d: 0.4, y: wallH / 2, z: ID / 2 - 0.25 }, { w: IW - 0.1, h: wallH, d: 0.4, y: wallH / 2, z: -(ID / 2 - 0.25) },
      { w: 0.4, h: wallH, d: ID - 0.1, y: wallH / 2, x: IW / 2 - 0.25 }, { w: 0.4, h: wallH, d: ID - 0.1, y: wallH / 2, x: -(IW / 2 - 0.25) },
      ...[-1, 0, 1].flatMap((i) => [-1, 1].map((k) => ({ w: 0.7, h: wallH, d: 0.7, x: i * 7.2, y: wallH / 2, z: k * 4.6 }))),
    ]), FM.concrete));
    walls.position.y = FLOOR_Y + RAFT + 0.16;
    g.add(walls);

    // Zemin kat döşemesi (kazının tamamını örter)
    const slabM = shadow(new THREE.Mesh(new THREE.BoxGeometry(PW + 0.2, 1.0, PD + 0.2).translate(0, -0.5, 0), M.whiteStone));
    g.add(slabM);

    return { blk, mask, pit, shoring, piles, starters, rig, lean, memFloor, memWalls, rebar, raft, walls, slabM, pilePts };
  });

  // Adım zaman pencereleri (scroll ilerlemesi)
  const FT = {
    dig: [0.322, 0.352], piles: [0.352, 0.392], lean: [0.392, 0.404], mem: [0.404, 0.418],
    rebar: [0.418, 0.446], raft: [0.446, 0.47], walls: [0.47, 0.494], slab: [0.494, 0.514],
  };
  const win = (p, [a, b]) => clamp01((p - a) / (b - a));

  // ---- Temel bilgi kartları (3D noktaya bağlı HTML etiketleri) ----
  const STEPS = [
    { key: 'dig', t: 'Kazı ve İksa', s: '−6.00 m bodrum kotu · Ø80 sekant kazık perde · 2 sıra öngermeli ankraj', w: 'Kazı çevresindeki zemini ve komşu yapıları güvenle tutar.', a: [-PW / 2 + 0.4, -2.2, PD / 2 - 0.4] },
    { key: 'piles', t: 'Fore Kazık', s: '40 adet · Ø80 cm · 18 m · C35 beton, donatı kafesli', w: 'Yükü zayıf üst tabakalardan sağlam zemine aktarır, oturmayı önler.', a: [0, FLOOR_Y + 1, 0] },
    { key: 'lean', t: 'Grobeton', s: '10 cm C16 tesviye betonu', w: 'Donatıyı topraktan ayırır; düz ve temiz çalışma yüzeyi sağlar.', a: [IW * 0.2, FLOOR_Y + 0.1, 0] },
    { key: 'mem', t: 'Su Yalıtımı', s: 'Çift kat 4 mm bitümlü membran · perdelerde drenaj levhası', w: 'Yeraltı suyunun betona ve donatıya ulaşmasını engeller.', a: [-IW / 2, FLOOR_Y + 2.5, 2] },
    { key: 'rebar', t: 'Radye Donatısı', s: 'Alt + üst çift kat Ø20/15 · S420 · perde filizleri', w: 'Yükü tüm temele yayar; eğilme ve zımbalamaya karşı direnç verir.', a: [2, FLOOR_Y + RAFT, 2] },
    { key: 'raft', t: 'Radye Beton', s: '160 cm · C35/45 · kesintisiz pompa dökümü, vibratörlü', w: 'Tek parça monolitik plak; deprem yükünü bütün olarak karşılar.', a: [0, FLOOR_Y + RAFT, 0] },
    { key: 'walls', t: 'Bodrum Perdeleri', s: '40 cm su geçirimsiz beton · kolonlar · zemin kat döşemesi', w: 'Binayı zemine kenetler; toprak ve deprem itkisini taşır.', a: [IW / 2 - 0.25, -2, ID / 2 - 0.25] },
  ];
  const labelLayer = document.createElement('div');
  labelLayer.className = 'fnd-labels';
  if (!document.getElementById('fnd-label-css')) {
    const st = document.createElement('style');
    st.id = 'fnd-label-css';
    st.textContent = `
      .fnd-labels{position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden}
      .fnd-label{position:absolute;left:0;top:0;opacity:0;will-change:transform,opacity}
      .fnd-label i{position:absolute;left:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:#F2C35A;box-shadow:0 0 0 4px rgba(242,195,90,.25),0 0 14px rgba(242,195,90,.8)}
      .fnd-label span.ln{position:absolute;left:0;bottom:0;width:46px;height:1px;background:rgba(242,195,90,.85);transform-origin:0 0;transform:rotate(-45deg)}
      .fnd-label .card{position:absolute;left:34px;bottom:30px;width:min(300px,62vw);padding:12px 14px 13px;
        background:rgba(18,19,21,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
        border:1px solid rgba(242,195,90,.35);border-left:2px solid #F2C35A;color:#fff;font-family:Jost,system-ui,sans-serif}
      .fnd-label .no{display:block;font-size:10.5px;letter-spacing:.18em;color:#F2C35A;margin-bottom:4px}
      .fnd-label b{display:block;font-weight:500;font-size:16px;letter-spacing:.02em}
      .fnd-label em{display:block;font-style:normal;font-size:12.5px;line-height:1.45;color:rgba(255,255,255,.88);margin-top:4px}
      .fnd-label small{display:block;font-size:12px;line-height:1.45;color:rgba(255,255,255,.62);margin-top:6px}
      .fnd-label .bar{height:2px;background:rgba(255,255,255,.12);margin-top:9px}
      .fnd-label .bar>u{display:block;height:100%;width:0;background:#F2C35A}
      @media (max-width:767px){.fnd-label .card{width:min(230px,58vw);padding:9px 11px}.fnd-label b{font-size:14px}.fnd-label small{display:none}}`;
    document.head.appendChild(st);
  }
  const labels = STEPS.map((stp, i) => {
    const el = document.createElement('div');
    el.className = 'fnd-label';
    el.innerHTML = `<i></i><span class="ln"></span><div class="card"><span class="no">TEMEL · ${String(i + 1).padStart(2, '0')} / ${String(STEPS.length).padStart(2, '0')}</span><b></b><em></em><small></small><div class="bar"><u></u></div></div>`;
    el.querySelector('b').textContent = stp.t;
    el.querySelector('em').textContent = stp.s;
    el.querySelector('small').textContent = stp.w;
    labelLayer.appendChild(el);
    const A = BLOCKS[0];
    return { el, bar: el.querySelector('.bar > u'), pos: new THREE.Vector3(A.x + stp.a[0], stp.a[1], A.z + stp.a[2]), op: 0 };
  });
  host.appendChild(labelLayer);
  let labelOpacity = labels.map(() => 0);
  const _v = new THREE.Vector3();
  function updateLabels() {
    const W = host.clientWidth, Hh = host.clientHeight;
    labels.forEach((L, i) => {
      const o = labelOpacity[i];
      if (o < 0.01) { if (L.op !== 0) { L.el.style.opacity = '0'; L.op = 0; } return; }
      _v.copy(L.pos).project(camera);
      const sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * Hh;
      const cx = Math.min(Math.max(sx, 16), W - 390), cy = Math.min(Math.max(sy, 190), Hh - 16);
      L.el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
      L.el.style.opacity = String(o);
      L.op = o;
    });
  }

  function applyFoundation(p) {
    const dig = smooth(win(p, FT.dig));
    const pileT = win(p, FT.piles);
    const leanT = smooth(win(p, FT.lean));
    const memT = smooth(win(p, FT.mem));
    const rebT = win(p, FT.rebar);
    const raftT = smooth(win(p, FT.raft));
    const wallT = smooth(win(p, FT.walls));
    const slabT = easeOut(win(p, FT.slab));
    const open = dig > 0.001 && slabT < 0.999;

    for (const F of fnd) {
      F.mask.visible = open;
      F.pit.visible = open;
      F.pit.scale.y = Math.max(0.002, dig);
      F.shoring.visible = open;

      const n = F.piles.length;
      const pf = pileT * n;
      let rigAt = -1;
      F.piles.forEach((m, k) => {
        const t = clamp01(pf - k);
        m.visible = open && t > 0;
        m.position.y = FLOOR_Y + 0.6 + (1 - easeOut(t)) * (PILE_L - 0.6);
        if (t > 0 && t < 1) rigAt = k;
      });
      F.starters.count = Math.min(n, Math.floor(pf));
      F.starters.visible = open;
      F.rig.visible = open && pileT > 0 && pileT < 1;
      if (F.rig.visible) {
        const k = rigAt >= 0 ? rigAt : Math.min(n - 1, Math.floor(pf));
        const [u, v] = F.pilePts[k];
        F.rig.position.set(u + 0.0, FLOOR_Y, v + 1.4);
        F.rig.children[3].rotation.y = p * 900;
      }

      F.lean.visible = open && leanT > 0;
      F.lean.scale.x = Math.max(0.001, leanT);
      F.memFloor.visible = open && memT > 0;
      F.memFloor.scale.z = Math.max(0.001, memT);
      F.memWalls.visible = open && memT > 0;
      F.memWalls.scale.y = Math.max(0.001, memT);

      F.rebar.visible = open && rebT > 0;
      F.rebar.count = Math.floor(rebT * F.rebar.instanceMatrix.count);

      F.raft.visible = open && raftT > 0;
      F.raft.scale.y = Math.max(0.001, raftT);
      F.walls.visible = open && wallT > 0;
      F.walls.scale.y = Math.max(0.001, wallT);

      F.slabM.visible = slabT > 0;
      F.slabM.position.y = lerp(-1.2, 0, slabT);
    }
    FM.freshConcrete.roughness = lerp(0.25, 0.8, smooth(win(p, [0.47, 0.5])));
    FM.freshConcrete.color.setHex(0x8E8C87).lerp(new THREE.Color(0xA9A69F), smooth(win(p, [0.47, 0.5])));

    // Etiketler: her adım kendi penceresinde görünür
    STEPS.forEach((stp, i) => {
      const w = stp.key === 'walls' ? [FT.walls[0], FT.slab[1]] : FT[stp.key];
      const len = w[1] - w[0];
      const fade = Math.min(0.006, len * 0.25);
      const o = smooth((p - w[0] + fade * 0.5) / fade) * (1 - smooth((p - w[1] + fade * 0.5) / fade));
      labelOpacity[i] = o;
      labels[i].bar.style.width = (clamp01((p - w[0]) / len) * 100).toFixed(1) + '%';
    });
    return slabT;
  }

  // Eski API ile uyum: zemin kat plağı (bina katlarının oturduğu kot)
  const slab = new THREE.Group();
  for (const blk of BLOCKS) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(BW + 3.6, SLAB_TOP, BD + 3.6).translate(blk.x, SLAB_TOP / 2, blk.z), M.whiteStone);
    s.castShadow = s.receiveShadow = !mobile;
    slab.add(s);
  }
  scene.add(slab);


  const yieldThread = () => new Promise((r) => setTimeout(r, 0));
  await yieldThread();

  // ---- Kat Geometri Şablonları (Gerçek Girintili Pencereler + Derzli Gri Taş Duvar + C-Çerçeve + Ahşap Lamel) ----
  // Not: Pencereler artık tüm cepheyi kaplayan dev bir kutu değil; gri taş duvarın (BW x BD) içinde
  // tekil pencere boşlukları olarak konumlanır ve her pencere 4x4 oda atlasından farklı bir odayı gösterir!
  function buildFloorGeo(kind, variantSeed = 0) {
    const white = [];
    const grey = [];
    const wood = [];
    const glass = [];
    const shop = [];
    const sconce = [];
    const rail = [];
    const metal = [];
    const shopGlass = [];
    const shopCeil = [];
    const shopFloor = [];
    const cad = [];
    const gh = FH - 0.38;

    if (kind === 'podium0' || kind === 'podium1') {
      const pw = BW + 1.8, pd = BD + 1.8;
      // Üst beyaz silme + alt baza
      white.push({ w: pw + 0.6, h: 0.44, d: pd + 0.6, y: FH - 0.22 });
      white.push({ w: pw + 0.4, h: 0.24, d: pd + 0.4, y: 0.12 });
      cad.push({ w: pw + 0.6, h: FH, d: pd + 0.6, y: FH / 2 });

      // Gerçek iç hacimli dükkan/kafe vitrinleri:
      //  - cam, cephe kolonlarının 45 cm gerisinde, yarı saydam ve gökyüzünü yansıtır
      //  - camın 3.2 m arkasında aydınlatılmış arka duvar (kamera döndükçe gerçek derinlik/paralaks)
      //  - ışıklı tavan, cilalı zemin, sarkıt lambalar ve tezgâhlar 3D
      const GIN = 0.45, DIN = 3.2;
      const yb = 0.24, ih = gh - yb;
      const isUpper = kind === 'podium1';
      shop.push({
        w: pw - DIN * 2, h: ih, d: pd - DIN * 2, y: yb + ih / 2,
        uvScaleX: 0.5, uvScaleY: 1, uvOffX: isUpper ? 0.5 : 0, uvOffY: 0,
      });
      shopCeil.push({ w: pw - GIN * 2, h: 0.06, d: pd - GIN * 2, y: gh - 0.03, uvScaleX: (pw - GIN * 2) / 2.4, uvScaleY: (pd - GIN * 2) / 2.4 });
      shopFloor.push({ w: pw - GIN * 2, h: 0.04, d: pd - GIN * 2, y: yb + 0.02 });

      const faces = [
        { axis: 'z', len: pw, half: pd / 2 },
        { axis: 'x', len: pd, half: pw / 2 },
      ];
      faces.forEach((fc, fIdx) => {
        for (const sg of [-1, 1]) {
          const P = (list, u, w, y, h, depth, inset) => {
            const n = sg * (fc.half - inset);
            if (fc.axis === 'z') list.push({ w, h, d: depth, x: u, y, z: n });
            else list.push({ w: depth, h, d: w, x: n, y, z: u });
          };
          const L = fc.len - GIN * 2;
          // Cam
          P(shopGlass, 0, L, yb + ih / 2, ih, 0.03, GIN);
          // Doğramalar: her 1.9 m'de dikey kayıt, 2.55 m'de yatay kayıt, altta süpürgelik
          const nM = Math.round(L / 1.9);
          for (let m = 0; m <= nM; m++) P(metal, -L / 2 + (m * L) / nM, 0.07, yb + ih / 2, ih, 0.12, GIN);
          P(metal, 0, L, yb + 2.4, 0.07, 0.12, GIN);
          P(metal, 0, L, yb + 0.1, 0.2, 0.12, GIN);
          // Sarkıt lambalar (camın 1.4 m gerisinde) + askı kabloları
          for (let u = -L / 2 + 1.4; u <= L / 2 - 1.4; u += 2.1) {
            P(sconce, u, 0.34, gh - 0.95, 0.22, 0.34, GIN + 1.4);
            P(metal, u, 0.02, gh - 0.42, 0.84, 0.02, GIN + 1.4);
          }
          // Tezgâh / vitrin dolapları (kafede tezgâh, butikte teşhir masası)
          const seed = (fIdx * 2 + (sg > 0 ? 1 : 0) + (isUpper ? 3 : 0));
          for (let q = 0; q < 2; q++) {
            const u = (-0.25 + q * 0.5) * L + ((seed * 1.7) % 2 - 1);
            P(wood, u, 2.6, yb + 0.5, 1.0, 0.8, GIN + 2.2);
            P(white, u, 2.7, yb + 1.03, 0.06, 0.86, GIN + 2.2);
          }
        }
      });

      // Beyaz taş podyum kolonları ve vitrin bölmeleri
      for (const sx of [-1, -0.34, 0.34, 1]) {
        white.push({ w: 0.85, h: gh, d: 0.85, x: sx * (pw / 2 - 0.2), y: gh / 2, z: pd / 2 - 0.2 });
        white.push({ w: 0.85, h: gh, d: 0.85, x: sx * (pw / 2 - 0.2), y: gh / 2, z: -(pd / 2 - 0.2) });
      }
      for (const sz of [-0.5, 0.5]) {
        white.push({ w: 0.85, h: gh, d: 0.85, x: -(pw / 2 - 0.2), y: gh / 2, z: sz * (pd / 2 - 0.2) });
        white.push({ w: 0.85, h: gh, d: 0.85, x: pw / 2 - 0.2, y: gh / 2, z: sz * (pd / 2 - 0.2) });
      }
      if (kind === 'podium1') {
        rail.push({ w: pw + 0.5, h: 1.05, d: 0.08, y: 0.55, z: pd / 2 + 0.22 });
        rail.push({ w: 0.08, h: 1.05, d: pd + 0.5, x: -pw / 2 - 0.22, y: 0.55 });
      }
    } else if (kind === 'penthouse') {
      // Çatı teras katı + taşkın beyaz taş çatı alınlığı (cornice)
      grey.push({ w: BW - 2.2, h: gh, d: BD - 2.2, y: gh / 2, wuv: 1 / 2.4 });
      const winW = 3.2, winH = gh - 0.35;
      for (const bx of [-6.2, 0, 6.2]) {
        glass.push({ w: winW, h: winH, d: BD - 1.9, x: bx, y: gh / 2, uvScaleX: 0.25, uvScaleY: 0.25, uvOffX: 0.25, uvOffY: 0.5 });
      }
      for (const bz of [-4.8, 4.8]) {
        glass.push({ w: BW - 1.9, h: winH, d: winW, z: bz, y: gh / 2, uvScaleX: 0.25, uvScaleY: 0.25, uvOffX: 0.5, uvOffY: 0.25 });
      }
      // Geniş eğimli hisli kademeli beyaz taş çatı parapet alınlığı
      white.push(
        { w: BW + 1.2, h: 0.35, d: BD + 1.2, y: FH - 0.05 },
        { w: BW + 1.8, h: 1.35, d: BD + 1.8, y: FH + 0.58 },
        { w: BW + 2.1, h: 0.26, d: BD + 2.1, y: FH + 1.32 }
      );
      rail.push({ w: BW + 0.4, h: 1.0, d: 0.08, y: 0.5, z: BD / 2 + 0.1 });
      rail.push({ w: 0.08, h: 1.0, d: BD + 0.4, x: -BW / 2 - 0.1, y: 0.5 });
      cad.push({ w: BW + 1.8, h: FH + 1.2, d: BD + 1.8, y: (FH + 1.2) / 2 });
    } else {
      // i = 2..9: 8 Konut Katı — DIŞTA GERÇEK GRİ TAŞ DUVAR (BW x BD), PENCERELER TEKİL GİRİNTİLİ AÇIKLIKLAR!
      const isPairA = kind.startsWith('res_A');
      const isTopOfPair = kind.endsWith('top');
      const dir = isPairA ? 1 : -1;

      // 1. Kat arası beyaz döşeme silmesi + girintinin dibindeki iç çekirdek
      const REV = 0.36;            // pencere girinti derinliği (söve gölgesi)
      const yb = 0.38;             // silme üst kotu
      const head = 0.34;           // pencere üstü taş lento
      const winH = gh - head;
      const wy = yb + winH / 2;
      const WUV = 1 / 2.4;
      white.push({ w: BW + 0.55, h: 0.38, d: BD + 0.55, y: 0.19 });
      grey.push({ w: BW - REV * 2, h: gh, d: BD - REV * 2, y: yb + gh / 2, wuv: WUV });
      cad.push({ w: BW + 0.55, h: FH, d: BD + 0.55, y: FH / 2 });

      // 2. Sık cephe ritmi: pencere — taş/ahşap lamel ayak — pencere (düz gri duvar boşluğu yok)
      // Z cephelerinde 6, X cephelerinde 5 pencere; ayaklar her C-çerçeve çiftinde kayarak kenetlenir.
      const PIER = 1.3;
      const faces = [
        { axis: 'z', len: BW, half: BD / 2, bays: 6 },
        { axis: 'x', len: BD, half: BW / 2, bays: 5 },
      ];
      faces.forEach((fc, fIdx) => {
        const bayW = fc.len / fc.bays;
        const winW = bayW - PIER;
        for (const sgn of [-1, 1]) {
          // Cephe-yerel kutu: u = cephe boyunca, out = cephe düzleminden dışa (negatif = içeri)
          const P = (list, u, w, y, h, depth, out, extra) => {
            const n = sgn * (fc.half + out);
            if (fc.axis === 'z') list.push({ w, h, d: depth, x: u, y, z: n, ...extra });
            else list.push({ w: depth, h, d: w, x: n, y, z: u, ...extra });
          };
          // Ayaklar (köşeler dahil)
          for (let k = 0; k <= fc.bays; k++) {
            const u = k === 0 ? -fc.len / 2 + PIER / 2 : k === fc.bays ? fc.len / 2 - PIER / 2 : -fc.len / 2 + k * bayW;
            const isCorner = k === 0 || k === fc.bays;
            const isWood = !isCorner && (k + (isPairA ? 0 : 1)) % 2 === 1;
            if (isWood) {
              P(grey, u, PIER, yb + gh / 2, gh, REV - 0.12, -REV / 2 - 0.06, { wuv: WUV });
              for (let s = -2; s <= 2; s++) P(wood, u + s * 0.25, 0.13, yb + gh / 2, gh, 0.2, -0.1);
            } else {
              P(grey, u, PIER, yb + gh / 2, gh, REV, -REV / 2, { wuv: WUV });
            }
          }
          for (let b = 0; b < fc.bays; b++) {
            const uc = -fc.len / 2 + (b + 0.5) * bayW;
            // Lento
            P(grey, uc, winW, yb + winH + head / 2, head, REV, -REV / 2, { wuv: WUV });
            // Girintili cam (her pencere atlastan farklı bir oda)
            const cell = (variantSeed * 7 + fIdx * 5 + (sgn > 0 ? 3 : 0) + b * 3 + (variantSeed % 3) * b) % 16;
            P(glass, uc, winW, wy, winH, 0.06, -REV + 0.04, {
              uvScaleX: 0.25, uvScaleY: 0.25, uvOffX: (cell % 4) * 0.25, uvOffY: Math.floor(cell / 4) * 0.25,
            });
            // 3D siyah doğrama: yan kasalar + 2 kayıt
            for (const du of [-winW / 2 + 0.04, winW / 2 - 0.04, -winW / 6, winW / 6]) {
              P(metal, uc + du, 0.08, wy, winH, 0.1, -REV + 0.1);
            }
            // Denizlik + Fransız balkon cam korkuluk ve küpeşte
            P(white, uc, winW + 0.08, yb + 0.03, 0.06, REV + 0.06, -REV / 2 + 0.03);
            P(rail, uc, winW - 0.06, yb + 0.55, 1.0, 0.04, -0.08);
            P(metal, uc, winW, yb + 1.06, 0.05, 0.07, -0.08);
            P(cad, uc, winW, wy, winH, 0.05, -REV / 2);
          }
        }
      });


      // 3. Kenetlenen Beyaz C-Çerçeve Söveler (4 cephede köşeleri saran çıkmalı mimari çerçeveler)
      const cOffX = dir * (BW * 0.19);
      const cOffZ = dir * (BD * 0.19);
      const cW = BW * 0.62, cD = BD * 0.62;
      const beamY = isTopOfPair ? FH - 0.20 : 0.26;

      for (const sz of [-1, 1]) {
        white.push({ w: cW, h: 0.46, d: 0.58, x: cOffX, y: beamY, z: sz * (BD / 2 + 0.24) });
        white.push({ w: 0.62, h: FH, d: 0.58, x: cOffX + dir * (cW / 2 - 0.31), y: FH / 2, z: sz * (BD / 2 + 0.24) });
        cad.push({ w: cW, h: 0.46, d: 0.58, x: cOffX, y: beamY, z: sz * (BD / 2 + 0.24) });
        // C-çerçeve içi sıcak duvar aplik ışığı (fotoğraftaki dikey taş aydınlatmaları)
        if (!isTopOfPair) {
          sconce.push({ w: 0.24, h: 0.9, d: 0.1, x: dir * 4, y: 1.3, z: sz * (BD / 2 + 0.05) });
        }
      }
      for (const sx of [-1, 1]) {
        white.push({ w: 0.58, h: 0.46, d: cD, x: sx * (BW / 2 + 0.24), y: beamY, z: cOffZ });
        white.push({ w: 0.58, h: FH, d: 0.62, x: sx * (BW / 2 + 0.24), y: FH / 2, z: cOffZ + dir * (cD / 2 - 0.31) });
        cad.push({ w: 0.58, h: 0.46, d: cD, x: sx * (BW / 2 + 0.24), y: beamY, z: cOffZ });
        if (!isTopOfPair) {
          sconce.push({ w: 0.1, h: 0.9, d: 0.24, x: sx * (BW / 2 + 0.05), y: 1.3, z: dir * 2 });
        }
      }

      // Orta balkon çıkmaları ve cam korkuluklar
      white.push({ w: 4.8, h: 0.32, d: 0.9, x: 0, y: 0.22, z: BD / 2 + 0.35 });
      white.push({ w: 0.9, h: 0.32, d: 4.2, x: -BW / 2 - 0.35, y: 0.22, z: 0 });
      rail.push({ w: 4.6, h: 1.02, d: 0.08, x: 0, y: 0.88, z: BD / 2 + 0.72 });
      rail.push({ w: 0.08, h: 1.02, d: 4.0, x: -BW / 2 - 0.72, y: 0.88, z: 0 });
    }

    return {
      white: mergeBoxes(white),
      grey: grey.length ? mergeBoxes(grey) : null,
      wood: wood.length ? mergeBoxes(wood) : null,
      glass: glass.length ? mergeBoxes(glass) : null,
      shop: shop.length ? mergeBoxes(shop) : null,
      sconce: sconce.length ? mergeBoxes(sconce) : null,
      rail: rail.length ? mergeBoxes(rail) : null,
      metal: metal.length ? mergeBoxes(metal) : null,
      shopGlass: shopGlass.length ? mergeBoxes(shopGlass) : null,
      shopCeil: shopCeil.length ? mergeBoxes(shopCeil) : null,
      shopFloor: shopFloor.length ? mergeBoxes(shopFloor) : null,
      cadBoxes: cad,
    };
  }

  // Her kat için ayrı oda dağılım tohumu (variantSeed) ile şablon oluştur (katlar birbirinin kopyası olmaz)
  const floorTemplates = [];
  for (let i = 0; i < N; i++) {
    let kind = 'podium0';
    if (i === 1) kind = 'podium1';
    else if (i === N - 1) kind = 'penthouse';
    else if (i >= 2) {
      const rel = i - 2;
      const pair = Math.floor(rel / 2);
      const isTop = rel % 2 === 1;
      kind = (pair % 2 === 0 ? 'res_A_' : 'res_B_') + (isTop ? 'top' : 'bot');
    }
    floorTemplates.push(buildFloorGeo(kind, i + 1));
  }

  await yieldThread();

  // ---- Çatı Alınlığı: Gerçek 3D Kanal Harf "FETSAN GRUP" Tabelası ----
  // Gerçek cephe tabelası gibi: alınlıktan 18 cm aralıklı (stand-off) monte edilmiş, yanları fırçalanmış altın
  // metal, ön yüzü LED ile aydınlatılmış opal akrilik; arkasından taş alınlığa yumuşak ışık halesi vurur.
  // Derinlik, harf maskesinden üretilen ince dilimlerin üst üste dizilmesiyle (slice extrusion) elde edilir.
  try { await Promise.race([document.fonts.load('500 160px "Jost"'), new Promise((r) => setTimeout(r, 1200))]); } catch (e) { /* yedek font */ }
  const SIGN_TEXT = 'FETSAN GRUP';
  const signTex = (() => {
    const W = 2048, Hc = 320;
    const font = '500 190px "Jost", "Segoe UI", sans-serif';
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hc; const x = c.getContext('2d'); x.font = font; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; if ('letterSpacing' in x) x.letterSpacing = '26px'; return [c, x]; };
    const BASE = 236; // taban çizgisi
    const [cm, xm] = mk();
    xm.fillStyle = '#fff'; xm.fillText(SIGN_TEXT, W / 2, BASE);
    // Ön yüz: sıcak opal akrilik — merkez daha parlak, kenarda ince altın trim kapak
    const [cf, xf] = mk();
    const g = xf.createLinearGradient(0, BASE - 140, 0, BASE);
    g.addColorStop(0, '#FFE9A8'); g.addColorStop(0.5, '#F2B84A'); g.addColorStop(1, '#C98422');
    xf.fillStyle = g; xf.fillText(SIGN_TEXT, W / 2, BASE);
    xf.lineWidth = 7; xf.strokeStyle = '#8A5A16'; xf.strokeText(SIGN_TEXT, W / 2, BASE);
    xf.lineWidth = 2; xf.strokeStyle = 'rgba(255,226,150,0.85)'; xf.strokeText(SIGN_TEXT, W / 2, BASE);
    // Hale: harf arkasından taşa vuran yumuşak sıcak ışık
    const [ch, xh] = mk();
    if ('filter' in xh) xh.filter = 'blur(22px)';
    xh.fillStyle = 'rgba(255, 186, 92, 1)'; xh.fillText(SIGN_TEXT, W / 2, BASE);
    if ('filter' in xh) xh.filter = 'blur(6px)';
    xh.fillStyle = 'rgba(255, 210, 140, 0.8)'; xh.fillText(SIGN_TEXT, W / 2, BASE);
    const tex = (c, srgb) => {
      const t = new THREE.CanvasTexture(c);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      return t;
    };
    return { mask: tex(cm, false), face: tex(cf, true), halo: tex(ch, true), aspect: W / Hc };
  })();

  const signMats = {
    face: new THREE.MeshBasicMaterial({ map: signTex.face, alphaTest: 0.5, color: new THREE.Color(1.45, 1.2, 0.85) }),
    side: new THREE.MeshStandardMaterial({ color: 0x9A6A22, metalness: 0.92, roughness: 0.32, alphaMap: signTex.mask, alphaTest: 0.5, side: THREE.DoubleSide }),
    back: new THREE.MeshStandardMaterial({ color: 0x5A4220, metalness: 0.6, roughness: 0.5, alphaMap: signTex.mask, alphaTest: 0.5 }),
    halo: new THREE.MeshBasicMaterial({ map: signTex.halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0.95, 0.62, 0.3), toneMapped: false }),
  };

  // capH: büyük harf yüksekliği (m). Grup orijini alınlık yüzeyinde, +Z dışarı bakar.
  function createGoldChannelSign(capH) {
    const h = capH * (320 / 136);           // 190px font → ~136px büyük harf
    const w = h * signTex.aspect;
    const grp = new THREE.Group();
    const geo = new THREE.PlaneGeometry(w, h);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.02, h * 0.95), signMats.halo);
    halo.position.z = 0.015;
    grp.add(halo);
    const STAND = 0.06, DEPTHL = 0.16, SLICES = mobile ? 4 : 9;
    const back = new THREE.Mesh(geo, signMats.back);
    back.position.z = STAND;
    grp.add(back);
    for (let i = 1; i < SLICES; i++) {
      const s = new THREE.Mesh(geo, signMats.side);
      s.position.z = STAND + (DEPTHL * i) / SLICES;
      grp.add(s);
    }
    const face = new THREE.Mesh(geo, signMats.face);
    face.position.z = STAND + DEPTHL + 0.004;
    grp.add(face);
    // Harfin altı (bulunduğu yer) biraz yukarıda: yazının optik merkezi alınlık ortasına gelsin
    grp.children.forEach((m) => { m.position.y = h * 0.025; });
    return grp;
  }


  // ---- İkiz Blokların (A ve B) İnşası ----
  const tower = new THREE.Group();
  scene.add(tower);
  const floors = Array.from({ length: N }, () => []);
  const signs = new THREE.Group();
  tower.add(signs);

  const wirePos = [];

  BLOCKS.forEach((blk, bIdx) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(blk.x, blk.y, blk.z);
    tower.add(bGroup);

    for (let i = 0; i < N; i++) {
      // B blokta oda varyasyonlarını kaydır
      const tpl = floorTemplates[i];
      const f = new THREE.Group();
      const y0 = SLAB_TOP + i * FH;
      f.position.y = y0;

      const parts = [new THREE.Mesh(tpl.white, M.whiteStone)];
      if (tpl.grey) parts.push(new THREE.Mesh(tpl.grey, M.greyStone));
      if (tpl.glass) parts.push(new THREE.Mesh(tpl.glass, M.window));
      if (tpl.shop) parts.push(new THREE.Mesh(tpl.shop, M.shopWindow));
      if (tpl.wood) parts.push(new THREE.Mesh(tpl.wood, M.wood));
      if (tpl.sconce) parts.push(new THREE.Mesh(tpl.sconce, M.sconce));
      if (tpl.rail) parts.push(new THREE.Mesh(tpl.rail, M.railing));
      if (tpl.metal) parts.push(new THREE.Mesh(tpl.metal, M.darkMetal));
      if (tpl.shopCeil) parts.push(new THREE.Mesh(tpl.shopCeil, M.shopCeil));
      if (tpl.shopFloor) parts.push(new THREE.Mesh(tpl.shopFloor, M.shopFloor));
      if (tpl.shopGlass) { const gm = new THREE.Mesh(tpl.shopGlass, M.shopGlass); gm.renderOrder = 2; parts.push(gm); }

      for (const m of parts) {
        m.castShadow = !mobile && (m.material === M.whiteStone || m.material === M.greyStone);
        m.receiveShadow = !mobile && (m.material === M.whiteStone || m.material === M.greyStone);
        f.add(m);
      }

      f.visible = false;
      floors[i].push(f);
      bGroup.add(f);

      for (const cb of tpl.cadBoxes) {
        const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(cb.w, cb.h, cb.d));
        const a = e.attributes.position.array;
        const cx = blk.x + (cb.x || 0);
        const cy = blk.y + y0 + (cb.y || 0);
        const cz = blk.z + (cb.z || 0);
        for (let k = 0; k < a.length; k += 3) {
          wirePos.push(a[k] + cx, a[k + 1] + cy, a[k + 2] + cz);
        }
        e.dispose();
      }
    }

    // Çatı alınlığına (cornice) her iki cephede (Z+ sağ ön ve X- sol yan) parlak altın FETSAN GRUP imzası
    const corniceY = blk.y + SLAB_TOP + (N - 1) * FH + FH + 0.58;
    const sFront = createGoldChannelSign(0.82);
    sFront.position.set(blk.x, corniceY, blk.z + BD / 2 + 0.905);
    const sSide = createGoldChannelSign(0.82);
    sSide.rotation.y = -Math.PI / 2;
    sSide.position.set(blk.x - BW / 2 - 0.905, corniceY, blk.z);
    signs.add(sFront, sSide);
  });
  signs.visible = false;

  const topY = SLAB_TOP + N * FH;
  const signLight = new THREE.PointLight(0xFFD27D, 0, 50, 2);
  signLight.position.set(BLOCKS[0].x - 6, topY + 2, BLOCKS[0].z + BD / 2 + 8);
  tower.add(signLight);

  // ---- 360° Mimari Çizim (Blueprint) Tel Kafesi ----
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePos, 3));
  const wireTotal = wirePos.length / 3;
  wireGeo.setDrawRange(0, 0);
  const wire = new THREE.LineSegments(wireGeo, M.blueprint);
  scene.add(wire);

  await yieldThread();

  // ---- Çevre Kent ve Çok Kümeli Gerçekçi Ağaçlar (Ön Cephe Görüşünü Kapatmaz, Kenarları Çerçeveler) ----
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lots = [];
  const trees = [];
  const R = mobile ? 4 : 5;
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    if (!i && !j) continue;
    const cx = i * GRID, cz = j * GRID;
    const ring = Math.max(Math.abs(i), Math.abs(j));
    if (rnd() < 0.16 && ring > 1) {
      for (let t = 0; t < 8; t++) trees.push([cx + (rnd() - 0.5) * 38, cz + (rnd() - 0.5) * 38, 0.85 + rnd() * 0.45]);
      continue;
    }
    const hOf = () => {
      if (ring === 1) return 6 + rnd() * 7;
      if (ring === 2) return 10 + rnd() * 10;
      return 12 + rnd() * 16;
    };
    const pattern = rnd();
    if (pattern < 0.35) lots.push([cx, cz, 26 + rnd() * 10, 26 + rnd() * 10, hOf()]);
    else {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (rnd() > 0.2) lots.push([cx + sx * 12, cz + sz * 12, 16 + rnd() * 3, 16 + rnd() * 3, hOf()]);
      }
    }
    if (ring <= 2) for (let t = -2; t <= 2; t++) {
      trees.push([cx + t * 11, cz - 23.8, 0.8 + rnd() * 0.35]);
    }
  }
  // Site çevresi peyzaj ağaçları: Kameranın ön-sol bakış koridorunu (x: -24..14, z: 14..32) AÇIK bırak,
  // ağaçları fotoğraftaki gibi sağ/sol yanlara ve iki blok arasına yerleştir!
  const siteTreeCoords = [
    [22, 16, 1.05], [24, 6, 1.15], [23, -6, 1.0], [21, -16, 0.95],
    [-36, 10, 1.0], [-37, -2, 1.1], [-35, -14, 0.95], [-34, -24, 1.05],
    [23, 22, 0.82], [-30, 18, 0.85], [26, 26, 0.9],
    [-4, -31, 1.0], [8, -26, 0.95], [-20, -28, 1.05],
  ];
  for (const st of siteTreeCoords) trees.push(st);
  // Final kamera ile A blok arasındaki görüş koridorunu ağaçlardan temizle (cephe ve vitrinler kapanmasın)
  {
    const fa = -Math.PI * 0.23, ux = Math.sin(fa), uz = Math.cos(fa);
    for (let k = trees.length - 1; k >= 0; k--) {
      const rx = trees[k][0] - (-3.2), rz = trees[k][1] - (-1.2);
      const t = rx * ux + rz * uz;               // kameraya doğru mesafe
      const perp = Math.abs(rx * uz - rz * ux);  // görüş ekseninden sapma
      if (t > 18 && t < 140 && perp < 6 + t * 0.32) trees.splice(k, 1);
    }
  }

  const cityMat = new THREE.MeshStandardMaterial({
    color: 0x8A8782, roughness: 0.78, metalness: 0.1,
    emissive: 0xFFCA7A, emissiveMap: windowTexture(), emissiveIntensity: 0.15,
  });
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cityMat, lots.length);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4A4C50, roughness: 0.88 });
  const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), roofMat, lots.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  lots.forEach(([x, z, w, d, h], k) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    city.setMatrixAt(k, dummy.matrix);
    col.setHSL(0.08, 0.06, 0.48 + rnd() * 0.2);
    city.setColorAt(k, col);
    dummy.position.set(x, h, z);
    dummy.scale.set(w * 0.88, 0.8, d * 0.88);
    dummy.updateMatrix();
    roofs.setMatrixAt(k, dummy.matrix);
  });
  city.castShadow = city.receiveShadow = !mobile;
  scene.add(city, roofs);

  // Gerçekçi ağaçlar: Kahverengi gövde + 9 kümeli doğal yaprak tacı + ağaç başına doğal ton varyasyonu
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4A3525, roughness: 0.92 });
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 2.2, 7).translate(0, 1.1, 0);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);

  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  const canopyGeo = buildRealisticCanopyGeo(mobile ? 1 : 2);
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, trees.length);

  trees.forEach(([x, z, s], k) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(k, dummy.matrix);
    canopyMesh.setMatrixAt(k, dummy.matrix);
    // Doğal Akdeniz/İstanbul peyzaj yeşili varyasyonu (koyu servi, zeytin yeşili ve sıcak gün batımı yaprak tonu)
    col.setHSL(0.25 + (rnd() - 0.5) * 0.05, 0.30 + rnd() * 0.12, 0.11 + rnd() * 0.06); // gün batımında koyu zeytin/çam yeşili silüet
    canopyMesh.setColorAt(k, col);
  });
  canopyMesh.castShadow = canopyMesh.receiveShadow = !mobile;
  scene.add(trunkMesh, canopyMesh);

  // ---- Kamera Rotası: Daha Geniş Kadraj + Her Ekran Oranında Tam Sığdırma ----
  const H = topY + 2.5;             // ~41.8 m
  const FOCUS_X = -3.2, FOCUS_Z = -1.2;
  const A_FINAL = -Math.PI * 0.23;  // (-X, +Z) ön-sol köşe bakışı: A bloğun iki cephesi + sol arkada B blok
  const zoom = mobile ? 1.15 : 1;

  function cameraAngle(p) {
    if (p < 0.14) return lerp(A_FINAL - 0.45, A_FINAL, smooth(p / 0.14));
    if (p < 0.32) return A_FINAL + smooth((p - 0.14) / 0.18) * (Math.PI * 2); // Çizim fazında tam 360°
    if (p < 0.86) return A_FINAL + Math.PI * 2 + smooth((p - 0.32) / 0.54) * (Math.PI * 2);
    return A_FINAL + Math.PI * 4;
  }

  // [p, yarıçap, kamera yüksekliği, bakış yüksekliği] — Bir tık daha geniş, sokaktan çatı alınlığına tam kadraj
  const keys = [
    [0.00, 66, 28, 0],
    [0.12, 58, 20, 2],
    [0.22, 68, 27, H * 0.46],
    [0.32, 70, 28, H * 0.48],
    [0.35, 58, 31, -2],   // Temel: kazı çukuruna yukarıdan bakış
    [0.42, 50, 27, -3],
    [0.47, 52, 22, -2],
    [0.51, 54, 12, 4],
    [0.52, 54, 10, 6],
  ];
  // Final: kamera sokak göz hizasına iner; dikey çizgiler shift-lens ile paralel tutulur (bkz. tick)
  const finalKeys = [
    [0.86, 62, 13.5, H * 0.48],
    [0.93, 64, 6.0,  H * 0.49],
    [1.00, 66, 2.3,  H * 0.49],
  ];
  const BASE_FOV = camera.fov;
  // A blok ön-sol köşesi ve alınlık üst kotu (shift-lens kadrajı buna göre çözülür)
  const A_CORNER = { x: BLOCKS[0].x - BW / 2 - 1, z: BLOCKS[0].z + BD / 2 + 1 };
  const TOP_Y = SLAB_TOP + N * FH + 1.6;

  function sample(list, p) {
    for (let k = 0; k < list.length - 1; k++) {
      const a = list[k], b = list[k + 1];
      if (p <= b[0]) {
        const t = smooth((p - a[0]) / (b[0] - a[0]));
        return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
      }
    }
    const l = list[list.length - 1];
    return [l[1], l[2], l[3]];
  }

  function cameraTarget(p, built) {
    let r, y, ly;
    if (p < BUILD0) {
      [r, y, ly] = sample(keys, p);
    } else if (p < 0.86) {
      const h = SLAB_TOP + built * FH;
      const t = (p - BUILD0) / (0.86 - BUILD0);
      r = lerp(54, 62, t);
      y = lerp(10, 13.5, t) + (1 - t) * h * 0.22;
      ly = Math.max(6, h * 0.48);
    } else {
      [r, y, ly] = sample(finalKeys, p);
    }
    // Kare veya dar pencerelerde (aspect < 1.35) binanın yanlardan/üstten kesilmemesi için tüm fazlarda otomatik genişlet
    const aspectFit = Math.max(1, 1.32 / Math.max(0.58, camera.aspect));
    r *= aspectFit;

    const a = cameraAngle(p);
    return {
      x: FOCUS_X + Math.sin(a) * r * zoom,
      y,
      z: FOCUS_Z + Math.cos(a) * r * zoom,
      ly,
      w: smooth((p - 0.86) / 0.14),
    };
  }

  // ---- Durum ----
  let progress = 0;
  const cur = { x: 0, y: 0, z: 0, ly: 0, w: 0 };
  Object.assign(cur, cameraTarget(0, 0));

  function apply(p) {
    // 1. Arazi
    const plotT = clamp01((p + 0.025) / 0.085);
    strips.children.forEach((s, i) => { s.scale.x = Math.max(0.0001, easeOut(plotT * 4 - i)); });
    stakes.children.forEach((s, i) => { s.scale.y = Math.max(0.001, easeOut(plotT * 4 - i + 0.4)); });
    M.soil.opacity = 0.96 * smooth((p + 0.02) / 0.08);

    // 2. 360° Çizim (Tel kafes)
    const wireT = smooth((p - 0.14) / 0.16);
    wireGeo.setDrawRange(0, Math.floor(wireT * wireTotal / 2) * 2);
    // Temel fazında çizim soluklaşır, kazı ve donatı net okunur
    const fndDim = smooth((p - 0.33) / 0.03) * (1 - smooth((p - 0.5) / 0.04));
    M.blueprint.opacity = 0.72 * (1 - 0.72 * fndDim) * (1 - smooth((p - 0.74) / 0.12));
    wire.visible = wireT > 0 && M.blueprint.opacity > 0.01;

    // 3. Temel
    const slabT = applyFoundation(p);
    const plinthT = easeOut(win(p, [0.508, 0.52]));
    slab.scale.y = Math.max(0.001, plinthT);
    slab.visible = plinthT > 0.001;
    gardenWallGroup.visible = slabT > 0.5;

    // 4. Yapı (Her iki blokta kat kat yükselir)
    const b = clamp01((p - BUILD0) / BUILD_SPAN) * (N + 0.6);
    for (let i = 0; i < N; i++) {
      const t = clamp01(b - i);
      const vis = t > 0.001;
      const e = easeOut(t);
      for (const f of floors[i]) {
        f.visible = vis;
        if (vis) {
          f.scale.set(1, Math.max(0.001, e), 1);
          f.position.y = SLAB_TOP + i * FH + (1 - e) * 2.2;
        }
      }
    }
    signs.visible = b > N - 1.1;

    // 5. Final: Doğal gün batımı aydınlatması ve gerçekçi oda ışıkları
    const glow = smooth((p - 0.80) / 0.14);
    signLight.intensity = mobile ? 0 : glow * 150;
    M.window.emissiveIntensity = 0.85 + glow * 0.45;
    M.shopWindow.emissiveIntensity = 1.15 + glow * 0.4;
    M.shopCeil.emissiveIntensity = 1.3 + glow * 0.5;
    cityMat.emissiveIntensity = 0.12 + glow * 0.32;
    sun.intensity = lerp(2.35, 2.75, glow);
    hemi.intensity = lerp(0.85, 1.02, glow);

    return Math.min(N, Math.floor(b));
  }

  let built = 0;
  let dirty = true;
  let frames = 0;
  let running = false;
  let raf = 0;
  let lastShift = -1;
  let bloom = null;
  if (!mobile && renderer.capabilities.isWebGL2) {
    try { bloom = createBloom(renderer, { strength: 0.5, threshold: 1.25 }); } catch (e) { bloom = null; }
  }

  function resize() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    if (bloom) bloom.setSize(Math.round(w * dpr), Math.round(h * dpr));
    camera.aspect = w / h;
    lastShift = -1;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  function tick() {
    raf = requestAnimationFrame(tick);
    const tgt = cameraTarget(progress, Math.min(N, clamp01((progress - BUILD0) / BUILD_SPAN) * (N + 0.6)));
    const k = 0.16;
    const dx = tgt.x - cur.x, dy = tgt.y - cur.y, dz = tgt.z - cur.z, dl = tgt.ly - cur.ly, dw = tgt.w - cur.w;
    cur.x += dx * k; cur.y += dy * k; cur.z += dz * k; cur.ly += dl * k; cur.w += dw * k;
    const moving = Math.abs(dx) + Math.abs(dy) + Math.abs(dz) + Math.abs(dl) + Math.abs(dw) * 10 > 0.02;
    if (moving || dirty) frames = 0; else frames++;
    if (frames > 2) return;
    camera.position.set(cur.x, cur.y, cur.z);

    // Mimari fotoğraf kamerası (shift-lens): kamera yatay bakar, kadraj yukarı kaydırılır;
    // bina geriye devrilmez, sokak kotundan alınlığa kadar tek karede görünür.
    let lookY = cur.ly, fov = BASE_FOV, shift = 0;
    if (cur.w > 0.001) {
      const dist = Math.max(10, Math.hypot(A_CORNER.x - cur.x, A_CORNER.z - cur.z));
      const tanTop = (TOP_Y + 3.0 - cur.y) / dist;
      const tanBot = (-0.8 - cur.y) / dist;
      let half = (tanTop - tanBot) / 2;
      // Dar ekranlarda yatay açı yetmezse dikey açıyı büyüt
      half = Math.min(Math.tan(THREE.MathUtils.degToRad(34)), half);
      const center = (tanTop + tanBot) / 2;
      fov = lerp(BASE_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(half)), cur.w);
      shift = (center / (2 * half)) * cur.w;
      lookY = lerp(cur.ly, cur.y, cur.w);
    }
    if (Math.abs(camera.fov - fov) > 1e-4 || shift !== lastShift) {
      camera.fov = fov;
      const W = host.clientWidth || 1, Hh = host.clientHeight || 1;
      if (shift > 1e-4) camera.setViewOffset(W, Hh, 0, -shift * Hh, W, Hh);
      else camera.clearViewOffset();
      lastShift = shift;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(FOCUS_X, lookY, FOCUS_Z);
    if (bloom) bloom.render(scene, camera);
    else renderer.render(scene, camera);
    updateLabels();
    dirty = false;
  }

  // Sahne görünür olmadan önce tüm materyal shader'larını arka planda (KHR_parallel_shader_compile) derle
  for (const list of floors) for (const f of list) f.visible = true;
  gardenWallGroup.visible = true;
  signs.visible = true;
  wire.visible = true;
  if (typeof renderer.compileAsync === 'function') {
    try { await renderer.compileAsync(scene, camera); } catch (e) { /* desteklenmeyen ortam */ }
  } else if (typeof renderer.compile === 'function') {
    await yieldThread();
    renderer.compile(scene, camera);
  }
  built = apply(progress);

  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; dirty = true; raf = requestAnimationFrame(tick); }
    else if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
  });
  io.observe(host);

  return {
    floors: N,
    setProgress(p) {
      progress = clamp01(p);
      built = apply(progress);
      dirty = true;
      return built;
    },
    destroy() {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      labelLayer.remove();
      if (bloom) bloom.dispose();
      renderer.dispose(); pmrem.dispose(); envRT.dispose(); skyTex.dispose();
      host.removeChild(renderer.domElement);
    },
  };
}
