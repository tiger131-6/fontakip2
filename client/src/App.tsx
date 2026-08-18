import { useEffect, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';

import type { Fund } from './types';

import type { FundTableRow } from './types';

import { getFunds } from './api';

import FundDetail from './components/FundDetail';

import Sidebar from './components/Sidebar';

import SplitPane from './components/SplitPane';

import AppViewContent from './components/AppViewContent';

import PopoutShell from './components/PopoutShell';

import { TerminalProvider, useTerminal } from './context/TerminalContext';

import type { AppView } from './types/views';

import { getPopoutViewFromUrl } from './utils/popout';

import { useAutoSync } from './hooks/useAutoSync';

import { isNativeApp } from './config/apiBase';
import { ensureLocalServer } from './config/localServer';

import SyncProgressOverlay from './components/SyncProgressOverlay';
import UpdaterUI from './components/UpdaterUI';

import { subscribeSyncFinished } from './syncEvents';

import tigerLogo from './assets/tiger1tank.jpg';



function AppShell() {

  const [funds, setFunds] = useState<Fund[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Fund | null>(null);

  const [view, setView] = useState<AppView>('funds');
  const [serverStarting, setServerStarting] = useState(isNativeApp());

  const {

    isSplitMode,

    setIsSplitMode,

    leftPaneView,

    rightPaneView,

    setLeftPaneView,

    setRightPaneView,

    syncPanesFromView,

  } = useTerminal();



  const loadFunds = async () => {
    try {
      setFunds(await getFunds());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fonlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isNativeApp()) {
      void loadFunds();
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        await ensureLocalServer();
        if (!cancelled) {
          setServerStarting(false);
          await loadFunds();
        }
      } catch (e) {
        if (!cancelled) {
          setServerStarting(false);
          setLoading(false);
          setError(e instanceof Error ? e.message : 'Yerel sunucu başlatılamadı.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);



  const openFundFromTable = (row: FundTableRow) => {

    const real = funds.find((f) => f.fund_code === row.fund_code);

    setSelected(

      real ?? {

        fund_code: row.fund_code,

        fund_name: row.fund_name,

        is_tax_free: row.is_tax_free,

        is_active: row.is_active,

        is_favorite: row.is_favorite,

      }

    );

  };



  const handleViewChange = (next: AppView) => {

    setView(next);

    syncPanesFromView(next);

  };

  const native = isNativeApp();

  return (

    <div className={`flex min-h-full flex-col ${native ? 'pb-16' : ''}`}>

      <header className="shrink-0 border-b border-slate-200 bg-white">

        <div className="flex items-center justify-between px-5 py-4">

          <div className="flex items-center gap-3">

            <img

              src={tigerLogo}

              alt="Tiger I tank"

              className="h-9 w-9 rounded-lg object-cover"

            />

            <div>

              <h1 className="text-base font-bold text-slate-800 sm:text-lg">Yerel Yatırım Fonu Takip Sistemi</h1>

              {isSplitMode && !native && (

                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">

                  Terminal Modu — Bölünmüş Ekran

                </p>

              )}

            </div>

          </div>

        </div>

      </header>

      {native && serverStarting && (
        <div className="shrink-0 border-b border-indigo-200 bg-indigo-50 px-4 py-2 text-center text-xs text-indigo-900">
          Yerel veritabanı hazırlanıyor… İlk açılış birkaç saniye sürebilir.
        </div>
      )}

      <div className={`flex min-h-0 flex-1 ${native ? 'flex-col' : ''}`}>

        {!native && (
        <Sidebar

          active={view}

          onChange={handleViewChange}

          isSplitMode={isSplitMode}

          onSplitModeChange={setIsSplitMode}

        />
        )}



        <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-100">

          {isSplitMode && !native ? (

            <div className="grid h-full min-h-0 grid-cols-2 divide-x divide-slate-300">

              <SplitPane

                paneId="left"

                selectedView={leftPaneView}

                onViewChange={setLeftPaneView}

                funds={funds}

                loading={loading}

                error={error}

                onSelectFund={openFundFromTable}

                onReloadFunds={loadFunds}

              />

              <SplitPane

                paneId="right"

                selectedView={rightPaneView}

                onViewChange={setRightPaneView}

                funds={funds}

                loading={loading}

                error={error}

                onSelectFund={openFundFromTable}

                onReloadFunds={loadFunds}

              />

            </div>

          ) : (

            <div className="h-full overflow-y-auto">

              <AppViewContent

                view={view}

                funds={funds}

                loading={loading}

                error={error}

                onSelectFund={openFundFromTable}

                onReloadFunds={loadFunds}

              />

            </div>

          )}

        </main>

        {native && (
          <Sidebar
            active={view}
            onChange={handleViewChange}
            isSplitMode={false}
            onSplitModeChange={() => {}}
          />
        )}

      </div>



      {selected && (

        <FundDetail

          fund={selected}

          allFunds={funds}

          onClose={() => setSelected(null)}

        />

      )}

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: { background: '#333', color: '#fff' },
        }}
      />

      <UpdaterUI />

    </div>

  );

}



export default function App() {
  const popoutView = getPopoutViewFromUrl();
  const { isSyncing, progress, statusText, skipSync } = useAutoSync();

  useEffect(() => {
    return subscribeSyncFinished((detail) => {
      if (detail.source === 'auto-fonbul') {
        toast.success('FonBul metrikleri arka planda güncellendi.', { duration: 4000 });
      }
    });
  }, []);

  return (
    <>
      <SyncProgressOverlay
        isSyncing={isSyncing}
        progress={progress}
        statusText={statusText}
        onSkip={skipSync}
      />
      {popoutView ? (
        <PopoutShell view={popoutView} />
      ) : (
        <TerminalProvider>
          <AppShell />
        </TerminalProvider>
      )}
    </>
  );
}


