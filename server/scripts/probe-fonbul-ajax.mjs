import axios from 'axios';
import fs from 'fs';

const code = process.argv[2] || 'AAV';
const url = `https://www.fonbul.com/FonBulPlus/YatirimFonlari/FonProfilleri/FonFiyatTablosu/${code}`;
const { data: html } = await axios.get(url, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'tr-TR' },
  timeout: 20000,
});

const urls = [...html.matchAll(/url\s*:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
const unique = [...new Set(urls)];
console.log('ajax urls:', unique.length);
for (const u of unique) console.log(u);

const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
console.log('\nscript src sample:', scripts.filter((s) => s.includes('Fon') || s.includes('Fiyat')).slice(0, 10));

// search for FonFiyatTablosu related function calls
for (const pat of ['GetFonFiyat', 'FonFiyatTablo', 'FiyatTablo', 'gridData', 'kendoGrid']) {
  const idx = html.search(new RegExp(pat, 'i'));
  if (idx >= 0) {
    console.log('\n---', pat, '---');
    console.log(html.slice(idx, idx + 500).replace(/\s+/g, ' '));
  }
}
