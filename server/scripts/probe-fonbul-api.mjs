import axios from 'axios';
import * as cheerio from 'cheerio';

const code = process.argv[2] || 'AAV';
const pageUrl = `https://www.fonbul.com/FonBulPlus/YatirimFonlari/FonProfilleri/FonFiyatTablosu/${code}`;
const appUrl = 'https://www.fonbul.com/FonBulPlus/YatirimFonlari';
const servisUrl = 'https://internalapi.finnet.com.tr/FonBulPlusServis/fonbul/tr';

const client = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
    'Accept-Language': 'tr-TR,tr;q=0.9',
  },
  timeout: 30000,
});

const pageRes = await client.get(pageUrl);
const cookies = pageRes.headers['set-cookie']?.map((c) => c.split(';')[0]).join('; ') ?? '';
const $ = cheerio.load(pageRes.data);
const token = $('input[name="__RequestVerificationToken"]').val();
console.log('token', token ? 'yes' : 'no', 'cookies', cookies ? 'yes' : 'no');

const keyRes = await client.post(`${appUrl}/Uye/GetServisKey`, null, {
  headers: {
    Cookie: cookies,
    'X-CSRF-Token': token,
    'Content-Type': 'application/json; charset=utf-8',
  },
});
const servisKey = keyRes.data;
console.log('servisKey type', typeof servisKey, String(servisKey).slice(0, 40));

const bas = '2020-01-01';
const bit = new Date().toISOString().slice(0, 10);

const param = {
  Url: 'fonbul-profil-fiyat-grafik',
  RaporParametreleri: [
    { key: 'Kod', value: code },
    { key: 'KaydirilmisVeri', value: '0' },
    { key: 'TarihArtanSira', value: '0' },
    { key: 'IlkTarih', value: bas },
    { key: 'SonTarih', value: bit },
  ],
  OzelParametreler: [
    {
      key: 'VeriAlanlar',
      value: 'Tarih,Portfoy,FonAktif,Fiyat,ToplamPay,TedariktekiPay,DolulukOran,YatirimciAdet',
    },
  ],
  RaporKriter: { VeriGrup: 'FonKriter' },
};

const apiRes = await client.post(`${servisUrl}/RaporTabloHesapla`, { RaporParams: param }, {
  headers: {
    Cookie: cookies,
    'authorization-serviskey': servisKey,
    'Content-Type': 'application/json; charset=utf-8',
  },
});

const data = apiRes.data;
console.log('Durum', data?.Durum, 'Mesaj', data?.Mesaj);
const list = data?.TabloListesi?.[0];
if (list) {
  console.log('table keys', Object.keys(list));
  console.log('baslik', list.TabloBaslik ?? list.Basliklar);
  const rows = list.TabloSatir ?? list.Satirlar ?? list.Veriler;
  console.log('BaslikListe', list.BaslikListe);
  console.log('Veriler len', list.Veriler?.length);
  console.log('JSVeriler len', list.JSVeriler?.length);
  if (list.JSVeriler?.length) console.log('JSVeriler sample', JSON.stringify(list.JSVeriler.slice(0, 2), null, 2));
  if (list.Veriler?.length) console.log('Veriler sample', JSON.stringify(list.Veriler.slice(0, 2), null, 2));
  if (rows?.length) {
    console.log('rows', rows.length);
    console.log('sample', JSON.stringify(rows.slice(0, 2), null, 2));
  }
} else {
  console.log('full', JSON.stringify(data, null, 2).slice(0, 5000));
}
