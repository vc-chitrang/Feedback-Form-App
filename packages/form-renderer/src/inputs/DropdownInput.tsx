import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, PencilLine, Search } from 'lucide-react';
import { t, type ChoiceValue } from '@ff/form-schema';
import { cx, focusRing } from '../util';
import type { InputProps } from './types';

/**
 * Touch-friendly searchable dropdown (replaces the native <select>, whose option list is
 * tiny and unstyled on kiosks).
 *  - Tap to open a large option panel; type to filter.
 *  - If the question has an "Other – specify" option, anything typed that is not in the list
 *    is saved as that option with the typed text (e.g. "Other: Surat"), so visitors are never stuck.
 */
export function DropdownInput({ q, value, onChange, onAdvance, locale, fallbackLocale, labelId, errorId, invalid }: InputProps<'dropdown'>) {
  const v = (value as ChoiceValue | null) ?? null;
  const label = (o: { label: Record<string, string> }) => t(o.label, locale, fallbackLocale);
  const otherOpt = q.options.find((o) => o.isOther);
  const listed = q.options.filter((o) => !o.isOther);
  const selected = q.options.find((o) => o.uid === v?.optionUid) ?? null;
  const selectedText = selected ? (selected.isOther ? (v?.otherText ?? '') : label(selected)) : '';

  const [open, setOpen] = useState(false);
  /** Text being typed; null = show the current selection. */
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const text = query ?? selectedText;
  const needle = (query ?? '').trim().toLowerCase();
  const matches = useMemo(() => (needle ? listed.filter((o) => label(o).toLowerCase().includes(needle)) : listed), [needle, listed]); // eslint-disable-line react-hooks/exhaustive-deps
  const exact = needle ? listed.find((o) => label(o).trim().toLowerCase() === needle) : undefined;
  const canUseTyped = !!otherOpt && !!needle && !exact;
  const rowCount = matches.length + (canUseTyped ? 1 : 0);

  // Close when tapping anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  });

  const close = () => {
    setOpen(false);
    setActive(-1);
    setQuery(null); // show the committed selection again
  };

  const choose = (uid: string) => {
    const next: ChoiceValue = { optionUid: uid };
    onChange(next);
    close();
    inputRef.current?.blur();
  };

  const useTyped = () => {
    if (!otherOpt || !query?.trim()) return;
    onChange({ optionUid: otherOpt.uid, otherText: query.trim() });
    close();
    inputRef.current?.blur();
  };

  const onType = (s: string) => {
    setQuery(s);
    setOpen(true);
    setActive(0);
    const n = s.trim().toLowerCase();
    const hit = listed.find((o) => label(o).trim().toLowerCase() === n);
    if (hit) onChange({ optionUid: hit.uid });
    else if (otherOpt && n) onChange({ optionUid: otherOpt.uid, otherText: s.trim() }); // typed value counts immediately
    else onChange(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(rowCount - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0 && active < matches.length) choose(matches[active]!.uid);
      else if (open && canUseTyped && active === matches.length) useTyped();
      else {
        close();
        onAdvance?.(value);
      }
    }
  };

  const highlight = (s: string) => {
    if (!needle) return s;
    const i = s.toLowerCase().indexOf(needle);
    if (i < 0) return s;
    return (
      <>
        {s.slice(0, i)}
        <mark className="rounded bg-brand/15 px-0.5 text-inherit">{s.slice(i, i + needle.length)}</mark>
        {s.slice(i + needle.length)}
      </>
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-stone-400" aria-hidden />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-labelledby={labelId}
          aria-describedby={invalid ? errorId : undefined}
          aria-invalid={invalid || undefined}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          lang={locale}
          value={text}
          placeholder={t(q.placeholder, locale, fallbackLocale) || (otherOpt ? 'Search or type…' : 'Search…')}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKeyDown}
          className={cx(
            'h-16 w-full rounded-2xl border-2 bg-white pr-14 pl-13 text-xl text-stone-900 outline-none transition placeholder:text-stone-400',
            invalid ? 'border-red-400' : open ? 'border-brand' : 'border-stone-200',
            focusRing,
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? 'Close list' : 'Open list'}
          onClick={() => (open ? close() : (setOpen(true), inputRef.current?.focus()))}
          className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-stone-500 hover:bg-stone-100"
        >
          <ChevronDown className={cx('size-6 transition', open && 'rotate-180')} />
        </button>
      </div>

      {selected?.isOther && !open && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-stone-500">
          <PencilLine className="size-4" aria-hidden /> Your own answer
        </p>
      )}

      {open && (
        <div className="animate-step-in absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 shadow-stone-900/10 ring-stone-200">
          <ul id={listId} role="listbox" aria-labelledby={labelId} className="max-h-80 overflow-y-auto overscroll-contain p-2">
            {matches.map((o, i) => {
              const isSel = selected?.uid === o.uid;
              return (
                <li
                  key={o.uid}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isSel}
                  onPointerDown={(e) => e.preventDefault()} // keep input focus
                  onClick={() => choose(o.uid)}
                  onMouseEnter={() => setActive(i)}
                  className={cx(
                    'flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl px-4 text-lg transition',
                    isSel ? 'bg-brand/10 font-medium text-stone-900' : 'text-stone-800',
                    active === i && !isSel && 'bg-stone-100',
                  )}
                >
                  <span>{highlight(label(o))}</span>
                  {isSel && <Check className="size-5 shrink-0 text-brand" strokeWidth={3} aria-hidden />}
                </li>
              );
            })}
            {canUseTyped && (
              <li
                id={`${listId}-${matches.length}`}
                role="option"
                aria-selected={selected?.isOther ?? false}
                onPointerDown={(e) => e.preventDefault()}
                onClick={useTyped}
                onMouseEnter={() => setActive(matches.length)}
                className={cx(
                  'mt-1 flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-stone-200 px-4 text-lg text-stone-800',
                  active === matches.length && 'bg-stone-100',
                )}
              >
                <PencilLine className="size-5 shrink-0 text-brand" aria-hidden />
                <span>
                  Use “<strong className="font-semibold">{query?.trim()}</strong>”
                </span>
              </li>
            )}
            {rowCount === 0 && <li className="px-4 py-4 text-center text-stone-500">No matches. Try another spelling.</li>}
          </ul>
          {otherOpt && !needle && (
            <p className="border-t border-stone-100 px-5 py-3 text-sm text-stone-500">Not in the list? Just type it above.</p>
          )}
        </div>
      )}
    </div>
  );
}
