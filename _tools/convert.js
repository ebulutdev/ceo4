// Kaynak fotoğrafları AVIF + WebP + JPG olarak responsive boyutlarda üretir.
// 7.jpg ve 12.jpg (puro içeren kareler) bilinçli olarak dahil edilmedi.
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SRC = path.join(__dirname, '..', '_src');
const OUT = path.join(__dirname, '..', 'site', 'assets', 'img');
fs.mkdirSync(OUT, { recursive: true });

const MAP = {
  '1.jpg': 'masa-gulumseme',
  '2.jpg': 'masa-onden',
  '3.jpg': 'ofis-ayakta',
  '4.jpg': 'ofis-bakis',
  '6.jpg': 'chesterfield-dikey',
  '8.jpg': 'chesterfield-yatay',
  '9.jpg': 'masa-siyah-beyaz',
  '10.jpg': 'masa-dikey',
  '11.jpg': 'masa-gulumseme-dikey',
};

(async () => {
  for (const [file, name] of Object.entries(MAP)) {
    const img = sharp(path.join(SRC, file));
    const { width, height } = await img.metadata();
    const widths = width > height ? [768, 1280, 1920] : [540, 1080];
    for (const w of widths) {
      const base = sharp(path.join(SRC, file)).resize({ width: w });
      await base.clone().avif({ quality: 50, effort: 5 }).toFile(path.join(OUT, `${name}-${w}.avif`));
      await base.clone().webp({ quality: 74 }).toFile(path.join(OUT, `${name}-${w}.webp`));
    }
    const fb = widths[Math.min(1, widths.length - 1)];
    await sharp(path.join(SRC, file)).resize({ width: fb }).jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(OUT, `${name}-${fb}.jpg`));
    console.log(name, `${width}x${height}`, widths.join(','));
  }
  // Open Graph görseli (1200x630)
  await sharp(path.join(SRC, '2.jpg')).resize(1200, 630, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT, 'og-image.jpg'));
  console.log('og-image ok');
})();
