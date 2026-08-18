import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface FundOption {
  fund_code: string;
  fund_name: string;
}

interface Props {
  funds: FundOption[];
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  excludeCodes?: string[];
  disabled?: boolean;
  required?: boolean;
  className?: string;
  maxResults?: number;
}

function formatFundLabel(fund: FundOption): string {
  return `${fund.fund_code} — ${fund.fund_name}`;
}

export default function FundSearchSelect({
  funds,
  value,
  onChange,
  placeholder = 'Fon kodu veya adı ara…',
  allowEmpty = false,
  emptyLabel = 'Fon seçin…',
  excludeCodes = [],
  disabled = false,
  required = false,
  className = '',
  maxResults = 100,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  const excluded = useMemo(() => new Set(excludeCodes), [excludeCodes]);

  const selected = useMemo(
    () => funds.find((f) => f.fund_code === value) ?? null,
    [funds, value]
  );

  const options = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    const list = funds.filter((f) => !excluded.has(f.fund_code));
    const filtered = q
      ? list.filter(
          (f) =>
            f.fund_code.toLocaleLowerCase('tr-TR').includes(q) ||
            f.fund_name.toLocaleLowerCase('tr-TR').includes(q)
        )
      : list;
    return filtered.slice(0, maxResults);
  }, [funds, query, excluded, maxResults]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const selectCode = (code: string) => {
    onChange(code);
    close();
  };

  const displayValue = open
    ? query
    : selected
      ? formatFundLabel(selected)
      : allowEmpty && !value
        ? ''
        : '';

  const inputPlaceholder = open
    ? placeholder
    : selected
      ? ''
      : allowEmpty
        ? emptyLabel
        : placeholder;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((prev) => Math.min(prev + 1, Math.max(0, options.length - 1)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const pick = options[highlight];
      if (pick) selectCode(pick.fund_code);
      return;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {required && (
        <input
          tabIndex={-1}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          value={value}
          onChange={() => {}}
          required
          aria-hidden
        />
      )}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        <input
          id={inputId}
          type="text"
          value={displayValue}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder={inputPlaceholder}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (!event.target.value && allowEmpty) onChange('');
          }}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>

      {open && !disabled && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {allowEmpty && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectCode('')}
                className={`w-full px-3 py-2 text-left text-sm ${
                  !value ? 'bg-indigo-50 text-indigo-800' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {emptyLabel}
              </button>
            </li>
          )}
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">Sonuç bulunamadı</li>
          ) : (
            options.map((fund, index) => {
              const isSelected = fund.fund_code === value;
              const isHighlighted = index === highlight;
              return (
                <li key={fund.fund_code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectCode(fund.fund_code)}
                    onMouseEnter={() => setHighlight(index)}
                    className={`w-full px-3 py-2 text-left text-sm ${
                      isSelected || isHighlighted
                        ? 'bg-indigo-50 text-indigo-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-mono font-semibold">{fund.fund_code}</span>
                    <span className="text-slate-500"> — {fund.fund_name}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
