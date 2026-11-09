// Yerel geliştirme sunucusu: tüm istekleri (/api/contact dahil) ana server.mjs üzerinden çalıştırır.
process.env.PORT = process.argv[2] || process.env.PORT || '5173';
import('../server.mjs');
