import type { ReactNode } from 'react';

import type { AppView } from '../types/views';

import { isNativeApp } from '../config/apiBase';



export type { AppView } from '../types/views';



interface Props {

  active: AppView;

  onChange: (view: AppView) => void;

  isSplitMode: boolean;

  onSplitModeChange: (value: boolean) => void;

}



interface NavChild {
  id: AppView;
  label: string;
  badge: string;
  subLabel?: string;
}

interface NavItem {
  id: AppView;
  label: string;
  icon: ReactNode;
  highlight?: boolean;
  children?: NavChild[];
}

const ITEMS: NavItem[] = [

  {

    id: 'funds',

    label: 'Fonlar',

    icon: (

      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>

        <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />

      </svg>

    ),

  },

  {

    id: 'portfolio',

    label: 'Portföy',

    icon: (

      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>

        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />

        <path

          fillRule="evenodd"

          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"

          clipRule="evenodd"

        />

      </svg>

    ),

  },

  {

    id: 'simulator',

    label: 'Simülatör',

    highlight: true,

    icon: (

      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>

        <path d="M3 13.5A1.5 1.5 0 014.5 12h1.379a2.25 2.25 0 011.59.659l1.122 1.122A1.125 1.125 0 009.25 14.5h3.5a1.125 1.125 0 001.09-.84l.213-.852a1.5 1.5 0 011.342-1.158H15.5A1.5 1.5 0 0117 13.5v1A1.5 1.5 0 0115.5 16h-1.379a2.25 2.25 0 00-1.59.659l-1.122 1.122A1.125 1.125 0 0010.75 17.5h-3.5a1.125 1.125 0 00-1.09-.84l-.213-.852a1.5 1.5 0 00-1.342-1.158H4.5A1.5 1.5 0 003 15.5v-1z" />

        <path fillRule="evenodd" d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM5.47 4.22a.75.75 0 011.06 0l1.06 1.06a.75.75 0 11-1.06 1.06l-1.06-1.06a.75.75 0 010-1.06zM14.53 4.22a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 11-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zM10 7a3 3 0 100 6 3 3 0 000-6z" clipRule="evenodd" />

      </svg>

    ),

    children: [
      { id: 'simulator', label: 'Gelecek Projeksiyonu', badge: 'G' },
      { id: 'simulator-historical', label: 'Tarihsel Kıyaslama', badge: 'T' },
      { id: 'golge-portfoy', label: 'Günlük Tahmin', badge: 'GT' },
      { id: 'bist100', label: 'BIST 100', badge: 'B100', subLabel: 'Canlı Takip' },
    ],

  },

  {

    id: 'istatistik',

    label: 'İstatistik',

    highlight: true,

    icon: (

      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>

        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />

      </svg>

    ),

  },

  {

    id: 'fonbul',

    label: 'FonBul',

    icon: (

      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>

        <path d="M3 12v3c0 1.1.9 2 2 2h10a2 2 0 002-2v-3H3zm0-2h14V7c0-1.1-.9-2-2-2H5a2 2 0 00-2 2v3zm2-6h10a2 2 0 012 2v1H3V6a2 2 0 012-2z" />

      </svg>

    ),

  },

  {

    id: 'valor',

    label: 'Valör Planlayıcı',

    icon: (

      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>

        <path

          fillRule="evenodd"

          d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z"

          clipRule="evenodd"

        />

      </svg>

    ),

  },

  {

    id: 'settings',

    label: 'Ayarlar',

    icon: (

      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>

        <path

          fillRule="evenodd"

          d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.205 1.251l-1.18 2.044a1 1 0 01-1.186.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.113a7.047 7.047 0 010-2.228L2.205 6.282a1 1 0 01-.205-1.251l1.18-2.044a1 1 0 011.186-.447l1.598.54A6.993 6.993 0 017.51 3.025l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"

          clipRule="evenodd"

        />

      </svg>

    ),

  },

];



export default function Sidebar({ active, onChange, isSplitMode, onSplitModeChange }: Props) {
  const native = isNativeApp();

  if (native) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-200 bg-white px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        {ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition ${
                isActive ? 'text-indigo-700' : 'text-slate-500'
              }`}
            >
              <span className={isActive ? 'text-indigo-600' : 'text-slate-400'}>{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (

    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">

      <nav className="flex flex-col gap-1 p-3 pt-4">

        {ITEMS.map((item) => {
          const childActive = item.children?.some((child) => child.id === active) ?? false;
          const isActive = active === item.id || childActive;
          const isHighlight = item.highlight === true;

          return (
            <div key={item.id} className={isHighlight ? 'mb-1' : undefined}>
              <button
                type="button"
                onClick={() => onChange(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${
                  isActive
                    ? isHighlight
                      ? 'bg-gradient-to-r from-violet-100 to-violet-50 text-violet-900 ring-2 ring-inset ring-violet-300 shadow-sm'
                      : 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200'
                    : isHighlight
                      ? 'bg-violet-50/70 text-violet-800 ring-1 ring-inset ring-violet-200 hover:bg-violet-100 hover:text-violet-900'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <span className={isActive ? (isHighlight ? 'text-violet-700' : 'text-indigo-600') : isHighlight ? 'text-violet-500' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.children && (
                  <span className="rounded-full bg-violet-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
                    {item.children.length}
                  </span>
                )}
              </button>

              {item.children && (
                <div className="mt-1.5 space-y-1 rounded-xl border border-violet-200/80 bg-gradient-to-b from-violet-50/90 to-violet-50/40 p-1.5 shadow-sm">
                  {item.children.map((child) => {
                    const isChildActive = active === child.id;

                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => onChange(child.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                          isChildActive
                            ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
                            : 'text-violet-900 hover:bg-violet-100/80'
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                            isChildActive ? 'bg-white/20 text-white' : 'bg-violet-200 text-violet-800'
                          }`}
                        >
                          {child.badge}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{child.label}</span>
                          {child.subLabel && (
                            <span
                              className={`block truncate text-[10px] font-medium ${
                                isChildActive ? 'text-violet-100' : 'text-violet-600/80'
                              }`}
                            >
                              {child.subLabel}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

      </nav>



      <div className="mt-auto border-t border-slate-200 p-3">

        <div

          className={`rounded-xl border p-3 transition ${

            isSplitMode

              ? 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-slate-50 shadow-sm'

              : 'border-slate-200 bg-slate-50/80'

          }`}

        >

          <div className="mb-2.5 flex items-center justify-between gap-2">

            <div className="min-w-0">

              <div className="flex items-center gap-1.5">

                <svg

                  className={`h-3.5 w-3.5 shrink-0 ${isSplitMode ? 'text-indigo-600' : 'text-slate-400'}`}

                  viewBox="0 0 20 20"

                  fill="currentColor"

                  aria-hidden

                >

                  <path d="M3 4a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM11 4a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zM3 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-4zM11 13a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />

                </svg>

                <span className="text-xs font-bold text-slate-700">Bölünmüş Ekran</span>

              </div>

              <span

                className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${

                  isSplitMode

                    ? 'bg-indigo-600 text-white'

                    : 'bg-slate-200 text-slate-600'

                }`}

              >

                Terminal Modu

              </span>

            </div>

            <button

              type="button"

              role="switch"

              aria-checked={isSplitMode}

              aria-label="Bölünmüş ekranı aç veya kapat"

              onClick={() => onSplitModeChange(!isSplitMode)}

              className={`relative h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus:ring-2 focus:ring-indigo-300 ${

                isSplitMode ? 'bg-indigo-600' : 'bg-slate-300'

              }`}

            >

              <span

                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${

                  isSplitMode ? 'translate-x-5' : 'translate-x-0'

                }`}

              />

            </button>

          </div>

          <p className="text-[10px] leading-snug text-slate-500">

            İki görünümü yan yana çalıştırın — her panelde görünüm seçin.

          </p>

        </div>

      </div>

    </aside>

  );

}


