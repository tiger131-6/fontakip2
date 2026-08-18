import axios from 'axios';
import * as cheerio from 'cheerio';

const code = process.argv[2] || 'PHE';
const url = `https://www.fonbul.com/FonBulPlus/YatirimFonlari/FonProfilleri/FonFiyatTablosu/${code}`;
const { data: html } = await axios.get(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', 'Accept-Language': 'tr-TR' },
  timeout: 20000,
});

const $ = cheerio.load(html);
console.log('tables', $('table').length);
$('table').each((ti, table) => {
  const headers = $(table).find('th').map((_, th) => $(th).text().trim()).get();
  if (headers.length) console.log('TABLE', ti, 'headers:', headers);
  $(table)
    .find('tr')
    .slice(0, 4)
    .each((_, tr) => {
      const cells = $(tr)
        .find('td')
        .map((__, td) => $(td).text().replace(/\s+/g, ' ').trim())
        .get();
      if (cells.length) console.log(' row:', cells);
    });
});
