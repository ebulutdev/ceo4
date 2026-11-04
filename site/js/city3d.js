// FETSAN Grup imza gökdeleni — Three.js sahnesi.
// Scroll ilerlemesi (0–1) dışarıdan setProgress ile verilir:
// arazi → mimari çizim → temel → kat kat yapı → tabela ve son kamera turu.
import * as THREE from 'three';
import { RoomEnvironment } from '../assets/vendor/three/RoomEnvironment.js';

const FH = 3.6;            // kat yüksekliği
const SLAB_TOP = 0.8;      // temel plağı üst kotu

// Faz sınırları (main.js ile aynı)
export const PHASES = [0, 0.14, 0.32, 0.44, 0.86];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3);
const lerp = (a, b, t) => a + (b - a) * t;

// Basit kutu birleştirici: [{w,h,d,x,y,z}] → tek BufferGeometry (tek draw call)
function mergeBoxes(list) {
  const parts = list.map((b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    g.translate(b.x || 0, b.y || 0, b.z || 0);
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

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#141516');
  g.addColorStop(0.45, '#3a3b3d');
  g.addColorStop(0.72, '#7d7a74');
  g.addColorStop(0.82, '#a8a399');
  g.addColorStop(1, '#55565a');
  x.fillStyle = g; x.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Zemin: 64 m'lik kent ızgarası (50 m ada + 14 m yol). Karo köşesi = ada merkezi.
const GRID = 64;
function streetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const px = 256 / GRID;            // 4 px = 1 m
  const road = 14 * px, walk = 2.5 * px, mid = 128;
  x.fillStyle = '#343537'; x.fillRect(0, 0, 256, 256);          // ada yüzeyi
  x.fillStyle = '#3f4042';                                          // kaldırım
  x.fillRect(0, mid - road / 2 - walk, 256, road + walk * 2);
  x.fillRect(mid - road / 2 - walk, 0, road + walk * 2, 256);
  x.fillStyle = '#242527';                                          // asfalt
  x.fillRect(0, mid - road / 2, 256, road);
  x.fillRect(mid - road / 2, 0, road, 256);
  x.fillStyle = 'rgba(217, 215, 210, .28)';                         // şerit
  for (let k = 0; k < 256; k += 16) {
    if (Math.abs(k + 4 - mid) > road / 2 + 4) { x.fillRect(k, mid - 0.5, 8, 1); x.fillRect(mid - 0.5, k, 1, 8); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 128);
  for (let r = 0; r < 32; r++) {
    for (let k = 0; k < 8; k++) {
      const v = Math.random();
      if (v < 0.42) continue;
      const a = v > 0.9 ? 1 : v > 0.7 ? 0.55 : 0.25;
      x.fillStyle = `rgba(241, 226, 196, ${a})`;
      x.fillRect(k * 8 + 2, r * 4 + 1, 4, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function createCity(host, { mobile = false, logoUrl }) {
  const N = mobile ? 32 : 42;
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75, 2000 / Math.max(1, host.clientWidth));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0x7d7a74, mobile ? 220 : 280, mobile ? 820 : 1100);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(mobile ? 52 : 36, 1, 0.5, 2000);

  // Işık: düşük açılı akşam güneşi + gökyüzü
  const hemi = new THREE.HemisphereLight(0xc9ccd0, 0x2a2b2d, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xf3e3c6, 2.4);
  sun.position.set(-110, 150, 70);
  if (!mobile) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = sun.shadow.camera;
    s.left = -90; s.right = 90; s.top = 200; s.bottom = -40; s.near = 10; s.far = 500;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
  }
  scene.add(sun);

  // Malzemeler (palet: platin, gümüş, antrasit)
  const M = {
    ground: new THREE.MeshStandardMaterial({ color: 0x2c2d2f, roughness: 1 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 1, transparent: true, opacity: 0 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xd6d4cf, roughness: 0.82 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x5d6870, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.78, envMapIntensity: 1.5 }),
    core: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 1, emissive: 0xf1dfbe, emissiveIntensity: 0.08 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xbfc2c5, metalness: 1, roughness: 0.3 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x232426, metalness: 0.85, roughness: 0.38 }),
    railing: new THREE.MeshStandardMaterial({ color: 0xd4dadd, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.28 }),
    blueprint: new THREE.LineBasicMaterial({ color: 0xdfe3e6, transparent: true, opacity: 0.6 }),
    survey: new THREE.LineBasicMaterial({ color: 0xd9d7d2, transparent: true, opacity: 0.9 }),
  };

  // ---- Zemin ve parsel ----
  const street = streetTexture();
  street.repeat.set(40, 40);
  street.anisotropy = renderer.capabilities.getMaxAnisotropy();
  M.ground.map = street;
  M.ground.color.set(0xffffff);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID * 40, GRID * 40), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const PLOT = 25;
  const soil = new THREE.Mesh(new THREE.PlaneGeometry(PLOT * 2, PLOT * 2), M.soil);
  soil.rotation.x = -Math.PI / 2; soil.position.y = 0.02;
  soil.receiveShadow = true;
  scene.add(soil);

  // Parsel sınırı: zemine serilmiş ince şeritler (1px çizgiden daha okunaklı)
  const corners = [[-PLOT, -PLOT], [PLOT, -PLOT], [PLOT, PLOT], [-PLOT, PLOT], [-PLOT, -PLOT]];
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xe9e7e2 });
  const strips = new THREE.Group();
  const rots = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
  for (let i = 0; i < 4; i++) {
    const len = PLOT * 2;
    const s = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.45).translate(len / 2, 0, 0), stripMat);
    s.position.set(corners[i][0], 0.06, corners[i][1]);
    s.rotation.y = rots[i];
    s.scale.x = 0.0001;
    strips.add(s);
  }
  scene.add(strips);

  const stakes = new THREE.Group();
  for (const [x, z] of corners.slice(0, 4)) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.25), M.metal);
    st.position.set(x, 0.8, z);
    stakes.add(st);
  }
  scene.add(stakes);

  // ---- Temel: kazıklar + plak ----
  const piles = new THREE.Group();
  const pileGeo = new THREE.CylinderGeometry(0.55, 0.55, 3, 10).translate(0, 1.5, 0);
  for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) {
    const p = new THREE.Mesh(pileGeo, M.concrete);
    p.position.set(i * 6.5, 0, k * 6.5);
    p.castShadow = true;
    piles.add(p);
  }
  scene.add(piles);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(36, 1.6, 36).translate(0, -0.8, 0), M.concrete);
  slab.castShadow = slab.receiveShadow = true;
  scene.add(slab);

  // ---- Katlar (her kat ayrı nesne) ----
  const types = {
    podium: { w: 32, d: 32, spacing: 2.4, balcony: false },
    shaft: { w: 22, d: 22, spacing: 2.2, balcony: true },
    crown: { w: 19, d: 19, spacing: 1.9, balcony: false },
  };
  const typeOf = (i) => (i < 4 ? 'podium' : i >= N - 4 ? 'crown' : 'shaft');

  const geo = {};
  for (const [name, t] of Object.entries(types)) {
    const { w, d } = t;
    const gh = FH - 0.4;
    const concrete = [{ w: w + 0.7, h: 0.4, d: d + 0.7, y: 0.2 }];
    const railing = [];
    if (t.balcony) {
      for (const s of [-1, 1]) {
        concrete.push({ w: 1.6, h: 0.22, d: 10, x: s * (w / 2 + 0.8), y: 0.3 });
        railing.push({ w: 0.05, h: 1.1, d: 10, x: s * (w / 2 + 1.55), y: 0.95 });
        concrete.push({ w: 10, h: 0.22, d: 1.6, z: s * (d / 2 + 0.8), y: 0.3 });
        railing.push({ w: 10, h: 1.1, d: 0.05, z: s * (d / 2 + 1.55), y: 0.95 });
      }
    }
    const mullions = [];
    const mh = gh;
    const nW = Math.floor(w / t.spacing);
    for (let k = 0; k <= nW; k++) {
      const p = -w / 2 + (k * w) / nW;
      mullions.push({ w: 0.14, h: mh, d: 0.3, x: p, y: 0.4 + mh / 2, z: d / 2 + 0.05 });
      mullions.push({ w: 0.14, h: mh, d: 0.3, x: p, y: 0.4 + mh / 2, z: -d / 2 - 0.05 });
      mullions.push({ w: 0.3, h: mh, d: 0.14, x: w / 2 + 0.05, y: 0.4 + mh / 2, z: p });
      mullions.push({ w: 0.3, h: mh, d: 0.14, x: -w / 2 - 0.05, y: 0.4 + mh / 2, z: p });
    }
    // köşe kanatları (taşıyıcı)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mullions.push({ w: 0.7, h: FH, d: 0.7, x: sx * (w / 2 + 0.1), y: FH / 2, z: sz * (d / 2 + 0.1) });
    }
    geo[name] = {
      concrete: mergeBoxes(concrete),
      glass: new THREE.BoxGeometry(w, gh, d).translate(0, 0.4 + gh / 2, 0),
      core: new THREE.BoxGeometry(w - 2, gh - 0.6, d - 2).translate(0, 0.4 + gh / 2, 0),
      metal: mergeBoxes(mullions),
      railing: railing.length ? mergeBoxes(railing) : null,
    };
  }

  const tower = new THREE.Group();
  scene.add(tower);
  const floors = [];
  for (let i = 0; i < N; i++) {
    const g = geo[typeOf(i)];
    const f = new THREE.Group();
    f.position.y = SLAB_TOP + i * FH;
    const parts = [
      new THREE.Mesh(g.concrete, M.concrete),
      new THREE.Mesh(g.glass, M.glass),
      new THREE.Mesh(g.core, M.core),
      new THREE.Mesh(g.metal, M.metal),
    ];
    if (g.railing) parts.push(new THREE.Mesh(g.railing, M.railing));
    for (const m of parts) {
      m.castShadow = !mobile && (m.material === M.concrete || m.material === M.core);
      m.receiveShadow = !mobile && m.material === M.concrete;
      f.add(m);
    }
    f.visible = false;
    floors.push(f);
    tower.add(f);
  }
  const topY = SLAB_TOP + N * FH;

  // ---- Taç: çerçeve + direk ----
  const crown = new THREE.Group();
  const cw = types.crown.w;
  const crownBoxes = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) crownBoxes.push({ w: 0.8, h: 9, d: 0.8, x: sx * cw / 2, y: 4.5, z: sz * cw / 2 });
  crownBoxes.push({ w: cw + 0.8, h: 0.8, d: 0.8, y: 9, z: cw / 2 }, { w: cw + 0.8, h: 0.8, d: 0.8, y: 9, z: -cw / 2 });
  crownBoxes.push({ w: 0.8, h: 0.8, d: cw + 0.8, x: cw / 2, y: 9 }, { w: 0.8, h: 0.8, d: cw + 0.8, x: -cw / 2, y: 9 });
  crownBoxes.push({ w: cw - 4, h: 3, d: cw - 4, y: 1.5 });
  crown.add(new THREE.Mesh(mergeBoxes(crownBoxes), M.metal));
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.5, 22, 8).translate(0, 11, 0), M.metal);
  spire.position.y = 9.4;
  crown.add(spire);
  crown.position.y = topY;
  crown.visible = false;
  crown.traverse((o) => { if (o.isMesh) o.castShadow = !mobile; });
  tower.add(crown);

  // ---- FETSAN GRUP tabelası (orijinal logo, koyu tabela üzerinde yüksek kontrastlı) ----
  const signs = new THREE.Group();
  const rawLogoTex = await new THREE.TextureLoader().loadAsync(logoUrl);
  const logoTex = (() => {
    const img = rawLogoTex.image;
    const w = img.width, h = img.height;
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const sctx = src.getContext('2d');
    sctx.drawImage(img, 0, 0);
    const id = sctx.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 8) { d[i + 3] = 0; continue; }
      const r = d[i], b = d[i + 2];
      if (r - b > 45) {
        // Altın bina ikonu, "FETSAN GRUP" ve elmas (◆)
        d[i] = 240; d[i + 1] = 200; d[i + 2] = 48;
        d[i + 3] = Math.min(255, Math.round(Math.pow(a / 255, 0.72) * 255));
      } else {
        // Orijinal PNG'de siyah olan yatay çizgi ve "FETTAHOĞLU YAPI · AST MİMARLIK" yazısını
        // koyu tabela üzerinde net okunması için parlak platin/beyaza çevir ve ince vuruşları güçlendir
        d[i] = 244; d[i + 1] = 242; d[i + 2] = 236;
        d[i + 3] = Math.min(255, Math.round(Math.pow(a / 255, 0.52) * 255));
      }
    }
    sctx.putImageData(id, 0, 0);
    const out = document.createElement('canvas');
    out.width = w * 4; out.height = h * 4;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(src, 0, 0, out.width, out.height);
    const tex = new THREE.CanvasTexture(out);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    rawLogoTex.dispose();
    return tex;
  })();
  const aspect = rawLogoTex.image.width / rawLogoTex.image.height;
  const LW = 15, LH = LW / aspect;
  const logoMat = new THREE.MeshStandardMaterial({
    map: logoTex, transparent: true, alphaTest: 0.04, depthWrite: false,
    metalness: 0.22, roughness: 0.36,
    emissive: 0xffffff, emissiveMap: logoTex, emissiveIntensity: 0.28,
  });
  const reliefMat = new THREE.MeshBasicMaterial({ map: logoTex, color: 0x000000, transparent: true, opacity: 0.55, alphaTest: 0.08, depthWrite: false });
  const signY = SLAB_TOP + (N - 2) * FH + FH * 0.55;
  for (const side of [1, -1]) {
    const s = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(LW + 1.6, LH + 1.2, 0.35), M.darkMetal);
    const frame = new THREE.Mesh(mergeBoxes([
      { w: LW + 1.9, h: 0.16, d: 0.45, y: (LH + 1.2) / 2 },
      { w: LW + 1.9, h: 0.16, d: 0.45, y: -(LH + 1.2) / 2 },
      { w: 0.16, h: LH + 1.36, d: 0.45, x: (LW + 1.6) / 2 + 0.08 },
      { w: 0.16, h: LH + 1.36, d: 0.45, x: -(LW + 1.6) / 2 - 0.08 },
    ]), M.metal);
    const relief = new THREE.Mesh(new THREE.PlaneGeometry(LW, LH), reliefMat);
    relief.position.set(0.07, -0.07, 0.19);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(LW, LH), logoMat);
    logo.position.z = 0.24;
    s.add(back, frame, relief, logo);
    s.position.set(0, signY, side * (cw / 2 + 0.75));
    if (side < 0) s.rotation.y = Math.PI;
    signs.add(s);
  }
  signs.visible = false;
  tower.add(signs);
  const signLight = new THREE.PointLight(0xf1e2c4, 0, 40, 2);
  signLight.position.set(0, signY + 2, cw / 2 + 14);
  tower.add(signLight);

  // ---- Mimari çizim (blueprint) — tüm binanın tel kafesi, alttan üste çizilir ----
  const wirePos = [];
  for (let i = 0; i < N; i++) {
    const t = types[typeOf(i)];
    const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(t.w, FH, t.d));
    const a = e.attributes.position.array;
    const y0 = SLAB_TOP + i * FH + FH / 2;
    for (let k = 0; k < a.length; k += 3) wirePos.push(a[k], a[k + 1] + y0, a[k + 2]);
    e.dispose();
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePos, 3));
  const wireTotal = wirePos.length / 3;
  wireGeo.setDrawRange(0, 0);
  const wire = new THREE.LineSegments(wireGeo, M.blueprint);
  scene.add(wire);

  // ---- Çevre kent: ızgaraya oturan adalar, yakında alçak, uzakta yükselen siluet ----
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lots = [];
  const trees = [];
  const R = mobile ? 4 : 6;
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    if (!i && !j) continue;
    const cx = i * GRID, cz = j * GRID;
    const ring = Math.max(Math.abs(i), Math.abs(j));
    if (rnd() < 0.1 && ring > 1) { // park adası
      for (let t = 0; t < 10; t++) trees.push([cx + (rnd() - 0.5) * 40, cz + (rnd() - 0.5) * 40, 0.9 + rnd() * 0.6]);
      continue;
    }
    const hOf = () => {
      if (ring === 1) return 4 + rnd() * 6;          // komşu: alçak
      if (ring === 2) return 8 + rnd() * 12;
      if (rnd() > 0.82) return 45 + rnd() * 70;       // uzak siluet
      return 12 + rnd() * 30;
    };
    const pattern = rnd();
    if (pattern < 0.3) lots.push([cx, cz, 30 + rnd() * 12, 30 + rnd() * 12, hOf()]);
    else if (pattern < 0.65) {
      lots.push([cx - 12, cz, 20, 40, hOf()]);
      lots.push([cx + 12, cz, 20, 40, hOf()]);
    } else {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (rnd() > 0.15) lots.push([cx + sx * 12, cz + sz * 12, 18 + rnd() * 3, 18 + rnd() * 3, hOf()]);
    }
    // sokak ağaçları (yakın çevrede)
    if (ring <= 2) for (let t = -2; t <= 2; t++) {
      trees.push([cx + t * 10, cz - 23.8, 0.8 + rnd() * 0.4]);
      trees.push([cx - 23.8, cz + t * 10, 0.8 + rnd() * 0.4]);
    }
  }
  // parselin çevresindeki ağaçlar
  for (let t = -2; t <= 2; t++) {
    trees.push([t * 10, -23.8, 0.9], [t * 10, 23.8, 0.9], [-23.8, t * 10, 0.9], [23.8, t * 10, 0.9]);
  }

  const cityMat = new THREE.MeshStandardMaterial({ color: 0x6f7174, roughness: 0.8, metalness: 0.15, emissive: 0xf1e2c4, emissiveMap: windowTexture(), emissiveIntensity: 0.05 });
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cityMat, lots.length);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.9 });
  const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), roofMat, lots.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  lots.forEach(([x, z, w, d, h], k) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    city.setMatrixAt(k, dummy.matrix);
    col.setHSL(0.08, 0.025, 0.36 + rnd() * 0.22);
    city.setColorAt(k, col);
    // çatı parapeti: üstte hafif içeri çekilmiş koyu kat
    dummy.position.set(x, h, z);
    dummy.scale.set(w * 0.86, 1.2, d * 0.86);
    dummy.updateMatrix();
    roofs.setMatrixAt(k, dummy.matrix);
  });
  city.castShadow = city.receiveShadow = !mobile;
  scene.add(city, roofs);

  const treeMat = new THREE.MeshStandardMaterial({ color: 0x48504a, roughness: 1 });
  const treeGeo = new THREE.IcosahedronGeometry(1.3, 2).scale(1, 1.2, 1).translate(0, 2.8, 0);
  const treeMesh = new THREE.InstancedMesh(treeGeo, treeMat, trees.length);
  trees.forEach(([x, z, s], k) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rnd() * Math.PI, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    treeMesh.setMatrixAt(k, dummy.matrix);
  });
  treeMesh.castShadow = !mobile;
  scene.add(treeMesh);

  // ---- Kamera rotası ----
  const H = topY + 30;
  const A0 = -0.503;                // p ≈ 0.92'de ön cephe kameraya döner
  const TURN = Math.PI * 2 * 1.2;   // tam 360° + final geniş dönüş
  const zoom = mobile ? 1.15 : 1;
  // [p, yarıçap, kamera yüksekliği, bakış yüksekliği]
  const keys = [
    [0.00, 78, 40, 0],
    [0.12, 66, 28, 0],
    [0.22, 120, 70, 70],
    [0.32, 135, 95, 80],
    [0.40, 62, 16, 3],
    [0.44, 60, 12, 6],
  ];
  const finalKeys = [
    [0.86, 82, H * 0.82, H * 0.66],
    [0.93, 96, H * 0.8, H * 0.68],
    [1.00, 150, H * 1.02, H * 0.5],
  ];
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
    if (p < 0.44) {
      [r, y, ly] = sample(keys, p);
      // Dar dikey ekranda parsel ve çizim kadraja sığsın; inşaat başlarken yaklaş
      const fit = lerp(Math.max(1, 0.78 / camera.aspect), 1, smooth((p - 0.36) / 0.08));
      r *= fit; y *= fit;
    }
    else if (p < 0.86) {
      const h = SLAB_TOP + built * FH;
      const t = (p - 0.44) / 0.42;
      r = lerp(60, 82, t);
      y = 12 + h * 0.85;
      ly = Math.max(6, h * 0.62);
    } else [r, y, ly] = sample(finalKeys, p);
    const a = A0 + p * TURN;
    return { x: Math.sin(a) * r * zoom, y, z: Math.cos(a) * r * zoom, ly };
  }

  // ---- Durum ----
  let progress = 0;
  const cur = { x: 0, y: 0, z: 0, ly: 0 };
  const init = cameraTarget(0, 0);
  Object.assign(cur, init);

  function apply(p) {
    // Arazi
    const plotT = clamp01((p + 0.025) / 0.085);
    strips.children.forEach((s, i) => { s.scale.x = Math.max(0.0001, easeOut(plotT * 4 - i)); });
    stakes.children.forEach((s, i) => { s.scale.y = Math.max(0.001, easeOut(plotT * 4 - i + 0.4)); });
    M.soil.opacity = 0.9 * smooth((p + 0.02) / 0.06);

    // Çizim
    const wireT = smooth((p - 0.14) / 0.16);
    wireGeo.setDrawRange(0, Math.floor(wireT * wireTotal / 2) * 2);
    M.blueprint.opacity = 0.6 * (1 - smooth((p - 0.74) / 0.12));
    wire.visible = wireT > 0 && M.blueprint.opacity > 0.01;

    // Temel
    const pileT = (p - 0.32) / 0.06;
    piles.children.forEach((pl, i) => {
      const t = easeOut(pileT * 2 - (i % 5) * 0.12);
      pl.scale.y = Math.max(0.001, t);
      pl.visible = t > 0.001;
    });
    const slabT = easeOut((p - 0.37) / 0.06);
    slab.position.y = lerp(-1.7, SLAB_TOP, slabT);
    slab.visible = slabT > 0.001;

    // Yapı
    const b = clamp01((p - 0.44) / 0.4) * (N + 1.5);
    for (let i = 0; i < N; i++) {
      const t = clamp01(b - i);
      const f = floors[i];
      f.visible = t > 0.001;
      if (f.visible) {
        const e = easeOut(t);
        f.scale.set(1, Math.max(0.001, e), 1);
        f.position.y = SLAB_TOP + i * FH + (1 - e) * 2.5;
      }
    }
    const crownT = easeOut(b - N);
    crown.visible = crownT > 0.001;
    crown.scale.set(1, Math.max(0.001, crownT), 1);
    signs.visible = b > N - 1.6;

    // Final: tabela ve kent ışıkları
    const glow = smooth((p - 0.84) / 0.07);
    logoMat.emissiveIntensity = 0.28 + glow * 0.52;
    signLight.intensity = mobile ? 0 : glow * 220;
    M.core.emissiveIntensity = 0.08 + smooth((p - 0.8) / 0.12) * 0.9;
    cityMat.emissiveIntensity = 0.05 + smooth((p - 0.82) / 0.14) * 0.85;
    sun.intensity = lerp(2.4, 0.9, smooth((p - 0.82) / 0.16));
    hemi.intensity = lerp(0.7, 0.35, smooth((p - 0.82) / 0.16));

    return Math.min(N, Math.floor(b));
  }

  let built = 0;
  let dirty = true;
  let frames = 0;
  let running = false;
  let raf = 0;

  function resize() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  function tick() {
    raf = requestAnimationFrame(tick);
    const tgt = cameraTarget(progress, Math.min(N, clamp01((progress - 0.44) / 0.4) * (N + 1.5)));
    const k = 0.16;
    const dx = tgt.x - cur.x, dy = tgt.y - cur.y, dz = tgt.z - cur.z, dl = tgt.ly - cur.ly;
    cur.x += dx * k; cur.y += dy * k; cur.z += dz * k; cur.ly += dl * k;
    const moving = Math.abs(dx) + Math.abs(dy) + Math.abs(dz) + Math.abs(dl) > 0.02;
    if (moving || dirty) frames = 0; else frames++;
    if (frames > 2) return; // sahne durağansa GPU'yu yorma
    camera.position.set(cur.x, cur.y, cur.z);
    camera.lookAt(0, cur.ly, 0);
    renderer.render(scene, camera);
    dirty = false;
  }

  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; dirty = true; raf = requestAnimationFrame(tick); }
    else if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
  });
  io.observe(host);

  built = apply(0);

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
      renderer.dispose(); pmrem.dispose();
      host.removeChild(renderer.domElement);
    },
  };
}
