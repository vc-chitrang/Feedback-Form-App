import { Check } from 'lucide-react';
import { t, type ChoiceValue, type MultiChoiceValue } from '@ff/form-schema';
import { cx, focusRing } from '../util';
import type { InputProps } from './types';

const optionBase = cx(
  'flex w-full items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left text-lg transition active:scale-[0.99] min-h-16',
  focusRing,
);

function Indicator({ selected, shape }: { selected: boolean; shape: 'radio' | 'check' }) {
  return (
    <span
      aria-hidden
      className={cx(
        'grid size-7 shrink-0 place-items-center border-2 transition',
        shape === 'radio' ? 'rounded-full' : 'rounded-lg',
        selected ? 'border-brand bg-brand text-white' : 'border-stone-300 bg-white',
      )}
    >
      {selected && (shape === 'radio' ? <span className="size-2.5 rounded-full bg-white" /> : <Check className="size-4" strokeWidth={3} />)}
    </span>
  );
}

function OtherTextBox({
  value,
  onChange,
  locale,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  locale: string;
  onEnter?: () => void;
}) {
  return (
    <input
      autoFocus
      autoComplete="off"
      lang={locale}
      maxLength={200}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      placeholder="Please specify…"
      aria-label="Please specify"
      className={cx('mt-1 h-14 w-full rounded-2xl border-2 border-stone-200 bg-white px-5 text-lg outline-none focus:border-brand', focusRing)}
    />
  );
}

export function SingleChoiceInput({ q, value, onChange, onAdvance, locale, fallbackLocale, labelId, errorId, invalid }: InputProps<'single_choice'>) {
  const v = (value as ChoiceValue | null) ?? null;
  const selectedOpt = q.options.find((o) => o.uid === v?.optionUid);
  const chips = q.layout === 'chips';

  return (
    <div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={invalid ? errorId : undefined}
        aria-invalid={invalid || undefined}
        className={chips ? 'flex flex-wrap gap-3' : 'grid gap-3'}
      >
        {q.options.map((o) => {
          const selected = v?.optionUid === o.uid;
          const select = () => {
            const next: ChoiceValue = o.isOther ? { optionUid: o.uid, otherText: v?.otherText ?? '' } : { optionUid: o.uid };
            onChange(next);
            if (!o.isOther) onAdvance?.(next);
          };
          if (chips) {
            return (
              <button
                key={o.uid}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={select}
                className={cx(
                  'min-h-14 rounded-full border-2 px-6 text-lg transition active:scale-[0.98]',
                  focusRing,
                  selected ? 'border-brand bg-brand text-white' : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300',
                )}
              >
                {t(o.label, locale, fallbackLocale)}
              </button>
            );
          }
          return (
            <button
              key={o.uid}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={select}
              className={cx(optionBase, selected ? 'border-brand bg-brand/10 text-stone-900' : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300')}
            >
              <Indicator selected={selected} shape="radio" />
              <span>{t(o.label, locale, fallbackLocale)}</span>
            </button>
          );
        })}
      </div>
      {selectedOpt?.isOther && (
        <div className="mt-3">
          <OtherTextBox
            locale={locale}
            value={v?.otherText ?? ''}
            onChange={(text) => onChange({ optionUid: selectedOpt.uid, otherText: text })}
            onEnter={() => onAdvance?.(v)}
          />
        </div>
      )}
    </div>
  );
}

export function MultiChoiceInput({ q, value, onChange, locale, fallbackLocale, labelId, errorId, invalid }: InputProps<'multi_choice'>) {
  const v = (value as MultiChoiceValue | null) ?? { optionUids: [] };
  const selected = new Set(v.optionUids);
  const limitReached = q.maxSelect !== undefined && selected.size >= q.maxSelect;
  const otherOpt = q.options.find((o) => o.isOther && selected.has(o.uid));

  const toggle = (uid: string) => {
    const opt = q.options.find((o) => o.uid === uid)!;
    let next: string[];
    if (selected.has(uid)) next = v.optionUids.filter((u) => u !== uid);
    else if (opt.exclusive) next = [uid]; // "None of these" clears everything else
    else {
      const exclusiveUids = new Set(q.options.filter((o) => o.exclusive).map((o) => o.uid));
      next = [...v.optionUids.filter((u) => !exclusiveUids.has(u)), uid];
    }
    const keepOther = q.options.some((o) => o.isOther && next.includes(o.uid));
    onChange(next.length ? { optionUids: next, ...(keepOther ? { otherText: v.otherText ?? '' } : {}) } : null);
  };

  return (
    <div>
      {q.maxSelect !== undefined && (
        <p className="mb-3 text-sm text-stone-500" aria-live="polite">
          {selected.size} of {q.maxSelect} selected
        </p>
      )}
      <div role="group" aria-labelledby={labelId} aria-describedby={invalid ? errorId : undefined} className="grid gap-3">
        {q.options.map((o) => {
          const isSel = selected.has(o.uid);
          const disabled = !isSel && limitReached && !o.exclusive;
          return (
            <button
              key={o.uid}
              type="button"
              role="checkbox"
              aria-checked={isSel}
              aria-disabled={disabled || undefined}
              onClick={() => !disabled && toggle(o.uid)}
              className={cx(
                optionBase,
                isSel ? 'border-brand bg-brand/10 text-stone-900' : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300',
                disabled && 'cursor-not-allowed opacity-45',
              )}
            >
              <Indicator selected={isSel} shape="check" />
              <span>{t(o.label, locale, fallbackLocale)}</span>
            </button>
          );
        })}
      </div>
      {otherOpt && (
        <div className="mt-3">
          <OtherTextBox locale={locale} value={v.otherText ?? ''} onChange={(text) => onChange({ ...v, otherText: text })} />
        </div>
      )}
    </div>
  );
}

export function DropdownInput({ q, value, onChange, locale, fallbackLocale, labelId, errorId, invalid }: InputProps<'dropdown'>) {
  const v = (value as ChoiceValue | null) ?? null;
  const selectedOpt = q.options.find((o) => o.uid === v?.optionUid);
  return (
    <div>
      <select
        aria-labelledby={labelId}
        aria-describedby={invalid ? errorId : undefined}
        aria-invalid={invalid || undefined}
        value={v?.optionUid ?? ''}
        onChange={(e) => {
          const opt = q.options.find((o) => o.uid === e.target.value);
          onChange(opt ? (opt.isOther ? { optionUid: opt.uid, otherText: '' } : { optionUid: opt.uid }) : null);
        }}
        className={cx(
          'h-16 w-full appearance-none rounded-2xl border-2 bg-white bg-[length:1.25rem] bg-[right_1.25rem_center] bg-no-repeat px-5 pr-12 text-xl outline-none',
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2378716c' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
          invalid ? 'border-red-400' : 'border-stone-200 focus:border-brand',
          focusRing,
        )}
      >
        <option value="">{t(q.placeholder, locale, fallbackLocale) || 'Select…'}</option>
        {q.options.map((o) => (
          <option key={o.uid} value={o.uid}>
            {t(o.label, locale, fallbackLocale)}
          </option>
        ))}
      </select>
      {selectedOpt?.isOther && (
        <div className="mt-3">
          <OtherTextBox locale={locale} value={v?.otherText ?? ''} onChange={(text) => onChange({ optionUid: selectedOpt.uid, otherText: text })} />
        </div>
      )}
    </div>
  );
}

export function YesNoInput({ value, onChange, onAdvance, labelId }: InputProps<'yes_no'>) {
  const choices = [
    { v: true, label: 'Yes' },
    { v: false, label: 'No' },
  ];
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-4">
      {choices.map((c) => {
        const selected = value === c.v;
        return (
          <button
            key={c.label}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              onChange(c.v);
              onAdvance?.(c.v);
            }}
            className={cx(
              'h-24 rounded-3xl border-2 text-2xl font-medium transition active:scale-[0.98]',
              focusRing,
              selected ? 'border-brand bg-brand text-white' : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300',
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/** The consent statement itself is the question heading; this is the tick box. */
export function ConsentInput({ value, onChange, errorId, invalid }: InputProps<'consent'>) {
  const checked = value === true;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-describedby={invalid ? errorId : undefined}
      onClick={() => onChange(checked ? false : true)}
      className={cx(
        'flex w-full items-start gap-4 rounded-2xl border-2 p-5 text-left text-lg transition',
        focusRing,
        checked ? 'border-brand bg-brand/10' : 'border-stone-200 bg-white hover:border-stone-300',
      )}
    >
      <Indicator selected={checked} shape="check" />
      <span className="text-stone-800">I agree</span>
    </button>
  );
}
