// Firebase App Hosting için statik dosya ve iletişim formu (/api/contact) sunucusu.
// Ortam değişkenlerini (.env veya apphosting.yaml) okur ve "Gönderen Adı + Reply-To" tekniğiyle
// talepleri doğrudan umitfettahoglu@fetsangrup.com / iletisim@fetsangrup.com adreslerine iletir.
import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(DIR, 'site');

// Yerel geliştirme için .env dosyasını otomatik yükle
const envFile = join(DIR, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.mp4': 'video/mp4',
};

const FIELD_LABELS = {
  tur: 'Talep Türü',
  ad: 'Ad Soyad',
  eposta: 'E-posta',
  telefon: 'Telefon',
  firma: 'Firma / Kurum',
  bolge: 'Bölge / İlçe',
  konu: 'İş Birliği Konusu',
  yatirimTipi: 'Yatırım Tipi',
  butce: 'Bütçe Aralığı',
  mesaj: 'Mesaj',
};

// Basit IP bazlı hız sınırlayıcı (10 dakikada en fazla 6 talep)
const rateMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > 6;
}

const escapeHtml = (s) => String(s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const cleanHeader = (s) => String(s || '').replace(/[\r\n"<>]/g, ' ').trim();

// SMTP Transporter önbelleği
let smtpTransporter = null;
function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return smtpTransporter;
}

function readJsonBody(req, maxBytes = 16384) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
        req.destroy();
        reject(new Error('PAYLOAD_TOO_LARGE'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function handleContact(req, res) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (isRateLimited(ip)) {
    return sendJson(res, 429, { ok: false, error: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.' });
  }

  let data;
  try {
    data = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, error: 'Geçersiz istek verisi.' });
  }

  // Honeypot bot kontrolü
  if (data.website) {
    return sendJson(res, 200, { ok: true });
  }

  const ad = cleanHeader(data.ad);
  const eposta = cleanHeader(data.eposta);
  const mesaj = String(data.mesaj || '').trim();
  const tur = cleanHeader(data.tur || 'Genel');

  if (!ad || !eposta || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta) || mesaj.length < 10) {
    return sendJson(res, 400, { ok: false, error: 'Lütfen zorunlu alanları eksiksiz doldurun.' });
  }

  // Alıcı yönlendirmesi: İş Birliği ve Yatırım doğrudan Ümit Fettahoğlu'na, Genel ve Basın kurumsal maile
  const isExec = tur === 'İş Birliği' || tur === 'Yatırım';
  const toEmail = isExec
    ? (process.env.MAIL_TO_EXEC || 'umitfettahoglu@fetsangrup.com')
    : (process.env.MAIL_TO_INFO || 'iletisim@fetsangrup.com');

  const fromEmail = process.env.MAIL_FROM || process.env.SMTP_USER || 'form@fetsangrup.com';

  // 3 Başlık (Header) Tekniği:
  // 1. From: "Ahmet Yılmaz (Web Formu)" <form@fetsangrup.com> -> Gelen kutusunda kişinin adı görünür, spama düşmez
  // 2. Reply-To: "Ahmet Yılmaz" <ahmet@gmail.com> -> Outlook'ta "Yanıtla" deyince doğrudan kullanıcının mailine gider
  // 3. To: umitfettahoglu@fetsangrup.com / iletisim@fetsangrup.com
  const fromHeader = `"${ad} (Web Formu)" <${fromEmail}>`;
  const replyToHeader = `"${ad}" <${eposta}>`;
  const subject = `[${tur}] ${ad} — umitfettahoglu.com`;

  const keys = ['tur', 'ad', 'eposta', 'telefon', 'firma', 'bolge', 'konu', 'yatirimTipi', 'butce'];
  const rowsText = keys
    .filter((k) => data[k])
    .map((k) => `${FIELD_LABELS[k] || k}: ${data[k]}`)
    .join('\n') + `\n\nMesaj:\n${mesaj}`;

  const rowsHtml = keys
    .filter((k) => data[k])
    .map((k) => {
      let valHtml = escapeHtml(data[k]);
      if (k === 'eposta') valHtml = `<a href="mailto:${escapeHtml(data[k])}" style="color:#8C6D46;text-decoration:none;font-weight:600">${valHtml}</a>`;
      if (k === 'telefon') valHtml = `<a href="tel:${escapeHtml(data[k])}" style="color:#17181A;text-decoration:none">${valHtml}</a>`;
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #EAE6DF;color:#6E6A63;font-size:13px;width:150px">${escapeHtml(FIELD_LABELS[k] || k)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #EAE6DF;color:#17181A;font-size:14px;font-weight:500">${valHtml}</td>
        </tr>`;
    })
    .join('');

  const replyMailto = `mailto:${encodeURIComponent(eposta)}?subject=${encodeURIComponent(`Re: ${subject}`)}`;
  const htmlBody = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;background:#F7F5F0;padding:28px;border:1px solid #E2DDD5">
    <div style="border-bottom:2px solid #17181A;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8C6D46;font-weight:600">FETSAN GRUP · WEB İLETİŞİM FORMU</div>
        <h2 style="margin:6px 0 0;font-size:20px;color:#17181A;font-weight:600">${escapeHtml(ad)} — ${escapeHtml(tur)} Talebi</h2>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#FFFFFF;border:1px solid #EAE6DF">
      ${rowsHtml}
    </table>
    <div style="background:#FFFFFF;border:1px solid #EAE6DF;border-top:none;padding:16px 14px;margin-bottom:22px">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#6E6A63;margin-bottom:8px">Mesaj</div>
      <div style="font-size:14px;line-height:1.65;color:#17181A;white-space:pre-wrap">${escapeHtml(mesaj)}</div>
    </div>
    <div style="text-align:left">
      <a href="${replyMailto}" style="display:inline-block;background:#17181A;color:#F7F5F0;text-decoration:none;padding:12px 22px;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:600">
        ${escapeHtml(ad)} Kişisine Yanıtla (${escapeHtml(eposta)})
      </a>
    </div>
    <p style="margin-top:18px;font-size:11px;color:#8A857D">
      Not: Outlook veya Mail uygulamanızda doğrudan <strong>"Yanıtla (Reply)"</strong> butonuna bastığınızda alıcı olarak otomatik <strong>${escapeHtml(eposta)}</strong> seçilir.
    </p>
  </div>`;

  try {
    const transporter = getSmtpTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: fromHeader,
        to: toEmail,
        replyTo: replyToHeader,
        subject,
        text: rowsText,
        html: htmlBody,
      });
      return sendJson(res, 200, { ok: true });
    }

    if (process.env.RESEND_API_KEY) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromHeader,
          to: [toEmail],
          reply_to: replyToHeader,
          subject,
          text: rowsText,
          html: htmlBody,
        }),
      });
      if (!r.ok) throw new Error(`RESEND_${r.status}`);
      return sendJson(res, 200, { ok: true });
    }

    // Henüz SMTP veya RESEND anahtarı girilmemişse konsolda kırmızı hata (4xx/5xx) üretmeden 200 dön
    return sendJson(res, 200, {
      ok: true,
      delivered: false,
      fallback: 'mailto',
    });
  } catch (err) {
    console.error('[contact] Gönderim hatası:', err);
    return sendJson(res, 500, {
      ok: false,
      error: 'Gönderim sırasında bir hata oluştu.',
    });
  }
}

function resolve(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT + sep) && file !== ROOT) return null;
  try {
    const st = statSync(file);
    if (st.isDirectory()) return resolve(p + '/');
    return { file, size: st.size };
  } catch {
    return null;
  }
}

function requestHandler(req, res) {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/api/contact') {
    if (req.method === 'POST') return handleContact(req, res);
    res.writeHead(405, { Allow: 'POST' }).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const hit = resolve(req.url) || resolve('/index.html');
  const ext = extname(hit.file);
  const isImmutableAsset = /^\/assets\/(film|fonts|vendor)\//.test(urlPath);
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': isImmutableAsset
      ? 'public, max-age=604800, immutable'
      : 'no-store, no-cache, must-revalidate, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  };
  if (!isImmutableAsset) {
    headers.Pragma = 'no-cache';
    headers.Expires = '0';
  }
  const range = req.headers.range;
  if (range && ext === '.mp4') {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(hit.size - 1, parseInt(m[2], 10)) : hit.size - 1;
      if (start <= end && start < hit.size) {
        headers['Content-Range'] = `bytes ${start}-${end}/${hit.size}`;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        if (req.method === 'HEAD') { res.end(); return; }
        createReadStream(hit.file, { start, end }).pipe(res);
        return;
      }
    }
  }
  headers['Content-Length'] = hit.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(hit.file).pipe(res);
}

http.createServer(requestHandler).listen(PORT, () => console.log(`Sunucu hazır: ${PORT}`));
if (!process.env.K_SERVICE && PORT !== 5173) {
  const devSrv = http.createServer(requestHandler);
  devSrv.on('error', () => {});
  devSrv.listen(5173, () => console.log('Geliştirme portu hazır: 5173'));
}
