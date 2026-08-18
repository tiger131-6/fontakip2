# FundTrack Local

Yerel (local) yatırım fonu takip sistemi. 1014 Türk yatırım fonunu ve günlük
fiyat geçmişlerini SQLite'ta saklar; bir butonla TEFAS'tan en güncel fiyatı
çekip anında ekranda gösterir.

## Mimari

```
fundtrack-local/
├── server/   # Node.js + Express + TypeScript + better-sqlite3
│   └── src/
│       ├── db.ts            # SQLite şema (funds, price_history + UNIQUE index)
│       ├── tefas.ts         # TEFAS fiyat istemcisi (tekil + toplu pencere)
│       ├── seed.ts          # CSV + KAP'tan 1014 fonu içe aktarır
│       ├── seed-history.ts  # Tüm fonların tam geçmişini ay-ay senkronize eder
│       └── index.ts         # Express API (SSE dahil)
└── client/   # React (Vite) + TypeScript + Tailwind CSS
    └── src/
        ├── api.ts
        ├── App.tsx
        └── components/  # SearchBar, FundTable, FundDetail, TaxBadge, SyncPanel
```

- **Veritabanı:** `server/funds.db` (SQLite). `price_history` tablosunda
  `(fund_code, price_date)` üzerinde **UNIQUE index** vardır; fiyat ekleme
  `INSERT OR REPLACE` ile yapılır, böylece aynı gün defalarca yenilense bile
  mükerrer kayıt oluşmaz.
- **API:** `http://localhost:3001`
- **Arayüz:** `http://localhost:5173` (Vite). `/api` istekleri otomatik olarak
  backend'e proxy'lenir (CORS derdi yok).

## Kurulum ve Çalıştırma

> Önkoşul: Node.js 18+ (better-sqlite3 native modül kullanır; Windows'ta
> derleme gerekirse "Desktop development with C++" araçları gerekebilir, ancak
> çoğu sürümde hazır binary iner).

### 1) Backend (server)

```bash
cd server
npm install

# Veritabanını 1014 fon ile doldur (CSV'yi otomatik bulur).
# CSV başka yerdeyse yolunu verin:
#   npm run seed -- "C:\\tam\\yol\\Menkul_Kiymet_..._CSV_....csv"
npm run seed

# API'yi başlat (geliştirme, otomatik yeniden yükleme)
npm run dev
# -> FundTrack Local API çalışıyor: http://localhost:3001
```

Üretim derlemesi için: `npm run build && npm start`.

### 2) Frontend (client)

Yeni bir terminalde:

```bash
cd client
npm install
npm run dev
# -> http://localhost:5173
```

Tarayıcıda `http://localhost:5173` açın.

### 3) Masaüstü (Electron) — tam derleme

Kaynak kodda (`client/` veya `server/`) değişiklik yaptıktan sonra **her zaman**
tam paketi yeniden derleyin. Sadece `prepare:all` çalıştırmak `win-unpacked`'ı
güncellemez.

```bash
cd desktop
npm install
npm run dist
```

Bu komut sırasıyla:

1. React istemcisini derler → `resources/client`
2. Express sunucusunu paketler → `bundle/server.cjs`
3. `funds.seed.db` anlık görüntüsünü alır
4. `installer/win-unpacked/` ve `FundTrack Local Setup 1.0.0.exe` üretir
5. `win-unpacked` ile `resources/client` aynı JS bundle'ı kullandığını doğrular

**Çalıştırma:**

- Geliştirme/test: `desktop/installer/win-unpacked/FundTrack Local.exe`
- Kurulum: `desktop/installer/FundTrack Local Setup 1.0.0.exe`

> İlk çalıştırmadan sonra canlı veritabanı `%APPDATA%/FundTrack Local/funds.db`
> konumundadır. Yeni kod için uygulamayı kapatıp yukarıdaki `win-unpacked` exe'yi
> açın; eski Program Files kısayolu eski sürümü gösterebilir.

## Kullanım

1. Üstteki yapışkan arama çubuğundan fon **kodu** veya **adıyla** filtreleyin.
2. Bir satıra tıklayın → sağdan detay paneli açılır.
3. **"En Güncel Fiyatı Çek (TEFAS)"** butonuna basın → fiyat TEFAS'tan çekilir,
   veritabanına yazılır ve geçmiş tablosu sayfa yenilenmeden anında güncellenir.

## API Uçları

| Method | Yol | Açıklama |
| --- | --- | --- |
| GET | `/api/funds` | Tüm fonlar |
| GET | `/api/funds/:code/history` | Fonun fiyat geçmişi (tarih DESC) |
| POST | `/api/funds/:code/refresh` | TEFAS'tan güncel fiyatı çeker, upsert eder, geçmişi döndürür |
| POST | `/api/funds/:code/backfill?days=365` | Tek fon için N günlük geçmişi doldurur |
| GET | `/api/seed/start?start=YYYY-MM-DD` | **SSE** — tüm fonların tam geçmişini senkronize eder, canlı ilerleme yayınlar |
| GET | `/api/health` | Sağlık kontrolü |

## Tam Geçmiş Senkronizasyonu (Data Synchronization)

Arayüzün üstündeki **"Tam Geçmişi Senkronize Et"** butonu, tüm fonların TEFAS'taki
fiyat geçmişini (varsayılan `2020-01-01` → bugün) çeker ve canlı ilerleme
çubuğu gösterir (`GET /api/seed/start` SSE bağlantısı üzerinden).

**Neden ay-ay?** TEFAS yeni API'si tek istekte **en fazla ~1 ay** aralığa izin verir
("Tarih aralığı 1 ayı aşamaz"). Fon başına 11 yıllık geçmiş çekmek ~140 istek × 1014
fon ≈ 140.000 istek (~78 saat) eder ve IP yasaklanır. Bunun yerine fon kodu **boş**
gönderilir; böylece tek istek o ayın **tüm fonlarını** döndürür. ~150 pencere × 3 fon
tipi (YAT — Menkul Kıymet Yatırım Fonları) ≈ 78 istek (her istek arası katı **2 sn** gecikme) ile tüm geçmiş ~3 dakikada
toplanır. Kayıtlar `INSERT OR IGNORE` ile eklenir; işlem güvenle tekrar çalıştırılabilir.

## Notlar

- **Vergi durumu**, KAP'taki resmi fon tam ünvanında `"hisse senedi yoğun fon"`
  ifadesinin geçip geçmediğine göre belirlenir (seed sırasında hesaplanır).
- TEFAS yalnızca iş günlerinde ve genelde akşam fiyat yayımlar. Bu yüzden
  refresh, son ~10 günlük pencereden **en güncel mevcut** fiyatı alır ve
  TEFAS'ın bildirdiği gerçek tarihe yazar.
- Bu uygulama yereldir; gerçek yatırım/vergi kararları için resmi kaynakları
  esas alın.
```
