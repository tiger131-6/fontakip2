import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { BackupPayload } from '../types';
import { exportBackup, importBackup } from '../api';
import {
  checkApiHealth,
  getApiBase,
  isNativeApp,
  setApiBase,
} from '../config/apiBase';
import SyncPanel from './SyncPanel';

interface Props {
  onFinished?: () => void;
}

function isBackupPayload(value: unknown): value is BackupPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.funds) &&
    Array.isArray(v.price_history) &&
    Array.isArray(v.portfolio) &&
    Array.isArray(v.watchlist)
  );
}

export default function Settings({ onFinished }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => getApiBase());
  const [testingServer, setTestingServer] = useState(false);

  const handleSaveServer = async () => {
    setApiBase(serverUrl);
    setTestingServer(true);
    try {
      if (isNativeApp() && !serverUrl.trim()) {
        const { ensureLocalServer } = await import('../config/localServer');
        await ensureLocalServer();
        toast.success('Yerel veritabanı kullanılıyor.');
        onFinished?.();
        return;
      }
      const ok = await checkApiHealth();
      if (ok) {
        toast.success('Yerel veritabanı bağlantısı başarılı.');
        onFinished?.();
      } else {
        toast.error('Sunucuya ulaşılamadı. Adresi ve portu kontrol edin.');
      }
    } catch {
      toast.error('Sunucuya ulaşılamadı.');
    } finally {
      setTestingServer(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportBackup();
      toast.success('Yedekleme başarıyla bilgisayarınıza indirildi.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yedek indirilemedi.');
    } finally {
      setExporting(false);
    }
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const confirmed = window.confirm(
      'DİKKAT: Bu işlem mevcut tüm verilerinizi (portföy, geçmiş fiyatlar) silip yedekteki verileri üzerine yazacaktır. Emin misiniz?'
    );
    if (!confirmed) return;

    setImporting(true);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result ?? ''));
        if (!isBackupPayload(parsed)) {
          throw new Error('Dosya geçerli bir FundTrack yedek formatında değil.');
        }
        await importBackup(parsed);
        toast.success('Veritabanı başarıyla geri yüklendi!');
        onFinished?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Yedek geri yüklenemedi.');
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => {
      setImporting(false);
      toast.error('Dosya okunamadı.');
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <h2 className="mb-1 text-xl font-bold text-slate-800">Ayarlar</h2>
      <p className="mb-6 text-sm text-slate-500">
        Veri güvenliği, yedekleme, TEFAS ve FonBul senkronizasyonu.
      </p>

      <div className="space-y-6">
        {(isNativeApp() || getApiBase()) && (
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800">Sunucu Bağlantısı</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {isNativeApp() ? (
                <>
                  Uygulama varsayılan olarak <strong>cihaz içindeki</strong> veritabanını kullanır
                  (PC gerekmez). İsteğe bağlı olarak evdeki bir PC sunucusuna da bağlanabilirsiniz.
                  Uzak sunucu için <strong>port 3001</strong> kullanın. Yerel mod için alanı boş bırakın.
                </>
              ) : (
                <>
                  Android uygulaması veritabanı ve TEFAS senkronizasyonu için evdeki FundTrack API
                  sunucusuna bağlanır. <strong>Port 3001</strong> kullanın (5173 değil).
                </>
              )}
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-500">API Sunucu Adresi</label>
                <input
                  type="url"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder={isNativeApp() ? 'Boş = yerel veritabanı' : 'http://192.168.1.4:3001'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSaveServer()}
                disabled={testingServer || (!isNativeApp() && !serverUrl.trim())}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {testingServer ? 'Test ediliyor…' : isNativeApp() && !serverUrl.trim() ? 'Yerel Moda Dön' : 'Kaydet ve Test Et'}
              </button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-600">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path
                      fillRule="evenodd"
                      d="M2 3.5A1.5 1.5 0 013.5 2h2.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 008.378 4H16.5A1.5 1.5 0 0118 5.5v9A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5v-11zM5 8.25a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 015 8.25zm0 3a.75.75 0 01.75-.75h5.5a.75.75 0 010 1.5h-5.5A.75.75 0 015 11.25z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                Veri Yedekleme ve Güvenlik
              </h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                Tüm fonlar, fiyat geçmişi, portföy ve izleme listesi tek bir JSON dosyasına
                aktarılır. Geri yükleme mevcut veritabanını tamamen değiştirir; işlem öncesi yedek
                almanız önerilir.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting || importing}
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {exporting ? 'İndiriliyor…' : 'Yedeği İndir (.json)'}
            </button>

            <button
              type="button"
              onClick={handleRestoreClick}
              disabled={exporting || importing}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? 'Geri yükleniyor…' : 'Yedekten Geri Yükle'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileSelected}
            />
          </div>

        </section>

        <SyncPanel onFinished={onFinished} />
      </div>
    </div>
  );
}
