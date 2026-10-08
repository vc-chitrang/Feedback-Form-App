import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cx } from '@ff/form-renderer';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  /** Options with the same group are shown under a small heading. */
  group?: string;
}

interface SelectProps {
  value: string | number;
  /** Same shape as a native <select> change event, so existing handlers keep working. */
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  /** Either pass `options`, or native <option> children. */
  options?: SelectOption[];
  children?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
  /** Show a search box; defaults to on for lists longer than 10. */
  searchable?: boolean;
}

function optionsFromChildren(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode }>;
    const label = Children.toArray(el.props.children).join('');
    out.push({ value: String(el.props.value ?? label), label });
  });
  return out;
}

/**
 * Styled replacement for the native <select> used across the admin app.
 * The option panel is rendered in a portal (fixed position) so it is never clipped by
 * cards or modal scroll areas, and flips upwards when there is no room below.
 */
export function Select({ value, onChange, options, children, disabled, id, className, placeholder, searchable, ...rest }: SelectProps) {
  const opts = useMemo(() => options ?? optionsFromChildren(children), [options, children]);
  const current = opts.find((o) => o.value === String(value));
  const showSearch = searchable ?? opts.length > 10;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number }>({ left: 0, width: 0, maxH: 320 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? opts.filter((o) => `${o.label} ${o.description ?? ''} ${o.group ?? ''}`.toLowerCase().includes(q)) : opts;
  }, [opts, query]);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const width = Math.max(r.width, options?.some((o) => o.description) ? 360 : 0);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    if (below >= 260 || below >= above) setPos({ left, width, top: r.bottom + 6, maxH: Math.min(380, below) });
    else setPos({ left, width, bottom: window.innerHeight - r.top + 6, maxH: Math.min(380, above) });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    setActive(Math.max(0, filtered.findIndex((o) => o.value === String(value))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (showSearch) searchRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) close(false);
    };
    const onMove = () => place();
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the highlighted row visible while using the keyboard.
  useEffect(() => {
    if (open) panelRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery('');
    if (refocus) btnRef.current?.focus();
  };

  const choose = (o: SelectOption) => {
    if (o.value !== String(value)) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } } as unknown as ChangeEvent<HTMLSelectElement>);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = filtered[active];
      if (o) choose(o);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      close(e.key === 'Escape');
    }
  };

  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={rest['aria-label']}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKeyDown}
        className={cx(
          'flex h-10 w-full items-center gap-2 rounded-lg bg-white px-3 text-left text-sm text-stone-900 shadow-sm ring-1 transition',
          open ? 'ring-2 ring-stone-900' : 'ring-stone-300 hover:ring-stone-400',
          'focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500 disabled:hover:ring-stone-300',
          className,
        )}
      >
        {current?.icon && <span className="shrink-0 text-stone-500">{current.icon}</span>}
        <span className={cx('min-w-0 flex-1 truncate', !current && 'text-stone-400')}>{current?.label ?? placeholder ?? 'Select…'}</span>
        <ChevronDown className={cx('size-4 shrink-0 text-stone-400 transition', open && 'rotate-180')} aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            onKeyDown={onKeyDown}
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
            className="fixed z-[70] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl ring-1 shadow-stone-900/10 ring-stone-200"
          >
            {showSearch && (
              <div className="relative border-b border-stone-100 p-2">
                <Search className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder="Search…"
                  aria-label="Search options"
                  className="h-9 w-full rounded-lg bg-stone-50 pr-3 pl-8 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-stone-900"
                />
              </div>
            )}
            <ul id={listId} role="listbox" aria-label={rest['aria-label']} className="overflow-y-auto overscroll-contain p-1.5">
              {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-stone-500">No matches</li>}
              {filtered.map((o, i) => {
                const selected = o.value === String(value);
                const heading = o.group && o.group !== lastGroup ? o.group : null;
                lastGroup = o.group;
                return (
                  <li key={o.value} role="presentation">
                    {heading && <p className="px-2.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-wider text-stone-400 uppercase first:pt-1">{heading}</p>}
                    <div
                      role="option"
                      aria-selected={selected}
                      data-index={i}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => choose(o)}
                      onMouseMove={() => active !== i && setActive(i)}
                      className={cx(
                        'flex cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm transition-colors',
                        o.description ? 'py-2' : 'py-2',
                        active === i ? 'bg-stone-100' : '',
                        selected ? 'font-medium text-stone-900' : 'text-stone-700',
                      )}
                    >
                      {o.icon && (
                        <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg', selected ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600')}>
                          {o.icon}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{o.label}</span>
                        {o.description && <span className="block truncate text-xs font-normal text-stone-500">{o.description}</span>}
                      </span>
                      {selected && <Check className="size-4 shrink-0 text-stone-900" strokeWidth={2.5} aria-hidden />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
