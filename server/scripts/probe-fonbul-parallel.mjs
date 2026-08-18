import axios from 'axios';
import * as cheerio from 'cheerio';

const servisUrl = 'https://internalapi.finnet.com.tr/FonBulPlusServis/fonbul/tr';
const appUrl = 'https://www.fonbul.com/FonBulPlus/YatirimFonlari';
const pageBase =
  'https://www.fonbul.com/FonBulPlus/YatirimFonlari/FonProfilleri/FonFiyatTablosu';

const codes = ['PHE', 'AAV', 'AAL', 'HAI', 'VHS', 'GES', 'IPB', 'MAC', 'TTE', 'YAS'];
const end = new Date().toISOString().slice(0, 10);

async function fetchOne(code) {
  const t1 = Date.now();
  const client = axios.create({
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'tr-TR' },
    timeout: 30000,
  });
  const pageRes = await client.get(`${pageBase}/${code}`);
  const cookies = pageRes.headers['set-cookie']?.map((c) => c.split(';')[0]).join('; ') ?? '';
  const token = cheerio.load(pageRes.data)('input[name="__RequestVerificationToken"]').val();
  const keyRes = await client.post(`${appUrl}/Uye/GetServisKey`, null, {
    headers: { Cookie: cookies, 'X-CSRF-Token': token },
  });
  const sk = keyRes.data;
  const param = {
    Url: 'fonbul-profil-fiyat-grafik',
    RaporParametreleri: [
      { key: 'Kod', value: code },
      { key: 'KaydirilmisVeri', value: '0' },
      { key: 'TarihArtanSira', value: '0' },
      { key: 'IlkTarih', value: end },
      { key: 'SonTarih', value: end },
    ],
    OzelParametreler: [
      {
        key: 'VeriAlanlar',
        value: 'Tarih,Portfoy,FonAktif,Fiyat,ToplamPay,TedariktekiPay,DolulukOran,YatirimciAdet',
      },
    ],
    RaporKriter: { VeriGrup: 'FonKriter' },
  };
  const r = await client.post(`${servisUrl}/RaporTabloHesapla`, { RaporParams: param }, {
    headers: {
      Cookie: cookies,
      'authorization-serviskey': sk,
      'Content-Type': 'application/json',
    },
  });
  const rows = r.data?.TabloListesi?.[0]?.JSVeriler?.length ?? 0;
  return { code, rows, ms: Date.now() - t1, status: r.status };
}

const t0 = Date.now();
const results = await Promise.all(codes.map(fetchOne));
console.log('parallel 10 (own session each) in', Date.now() - t0, 'ms');
console.log(results);
