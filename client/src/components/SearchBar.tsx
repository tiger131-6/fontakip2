interface Props {
  value: string;
  onChange: (v: string) => void;
  totalCount: number;
  shownCount: number;
}

export default function SearchBar({ value, onChange, totalCount, shownCount }: Props) {
  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Fon kodu veya adıyla ara (örn. AAK, hisse, para piyasası)…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="hidden whitespace-nowrap text-sm text-slate-500 sm:block">
            <span className="font-semibold text-slate-700">{shownCount}</span> / {totalCount} fon
          </div>
        </div>
      </div>
    </div>
  );
}
