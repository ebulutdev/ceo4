# Ümit Fettahoğlu — CEO & Founder

FETSAN Grup Kurucu Ortağı ve Yönetim Kurulu Başkanı Ümit Fettahoğlu için tek sayfalık, sinematik kişisel marka sitesi.

## Çalıştırma

Statik bir sitedir; derleme adımı yoktur.

```bash
node _tools/serve.js 5173
```

Ardından tarayıcıda http://localhost:5173 adresine gidin. `site/` klasörü herhangi bir statik barındırmaya (Netlify, Vercel, cPanel vb.) olduğu gibi yüklenebilir.

## Yayına alma

Her yayından önce CSS/JS bağlantılarındaki sürüm etiketlerini güncelleyin, sonra yayınlayın:

```bash
node _tools/version.js
firebase deploy --only apphosting:umitfettahoglu-ceo3
```

Sürüm etiketi dosya içeriğinden üretilir; dosya değişince adres değişir ve ziyaretçilerin tarayıcısı eski kopyayı kullanmaz.

## Yapı

| Yol | İçerik |
|---|---|
| `site/index.html` | Sayfa yapısı ve tüm içerik |
| `site/js/main.js` | Sahne koreografisi (GSAP + ScrollTrigger + Lenis) |
| `site/js/city3d.js` | Three.js ile 3D FETSAN gökdeleni ve kent |
| `site/css/style.css` | Tasarım sistemi ve mobil uyum |
| `site/css/fonts.css` | Yerel Bodoni Moda + Jost fontları |
| `site/assets/` | Görseller, video kareleri, fontlar, logo, kütüphaneler |
| `PROMPT-OPUS-5.5.md` | Projenin tam planı ve içerik kaynakları |
| `_tools/` | Yerel sunucu ve görsel dönüştürme betikleri |

## Notlar

- İletişim formu henüz bir e-posta servisine bağlı değil. Bağlamak için `site/index.html` içindeki `data-endpoint` alanını doldurun.
- Sitedeki tüm bilgiler umitfettahoglu.com ve fetsangrup.com kaynaklıdır.
