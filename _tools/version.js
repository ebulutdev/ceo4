// Yayından önce çalıştırın: node _tools/version.js
// index.html içindeki CSS/JS bağlantılarına içerik özetinden sürüm etiketi ekler (?v=xxxxxxxx).
// Dosya değişince adres de değişir; tarayıcı eski önbellek kopyasını kullanamaz.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SITE = path.join(__dirname, '..', 'site');
const hash = (rel) => crypto.createHash('sha1').update(fs.readFileSync(path.join(SITE, rel))).digest('hex').slice(0, 8);

let html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const files = ['css/fonts.css', 'css/style.css'];
for (const f of files) {
  const re = new RegExp(`(href=")${f.replace(/[.\/]/g, '\\$&')}(\\?v=[^"]*)?(")`, 'g');
  html = html.replace(re, `$1${f}?v=${hash(f)}$3`);
}
// main.js kendi özetini, 3D modülü (city3d.js) ise v3d parametresiyle taşır
html = html.replace(/(src=")js\/main\.js(\?[^"]*)?(")/, `$1js/main.js?v=${hash('js/main.js')}&amp;v3d=${hash('js/city3d.js')}$3`);
fs.writeFileSync(path.join(SITE, 'index.html'), html);
console.log('Sürümler güncellendi:', [...files, 'js/main.js', 'js/city3d.js'].map((f) => `${f}=${hash(f)}`).join('  '));
