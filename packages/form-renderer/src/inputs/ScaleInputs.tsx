import { useState } from 'react';
import { Star } from 'lucide-react';
import { EMOJI_SCALE, t } from '@ff/form-schema';
import { cx, focusRing } from '../util';
import type { InputProps } from './types';

export function RatingInput({ q, value, onChange, onAdvance, labelId }: InputProps<'rating'>) {
  const [hover, setHover] = useState<number | null>(null);
  const current = typeof value === 'number' ? value : 0;
  const shown = hover ?? current;
  const words = q.max === 5 ? ['Very poor', 'Poor', 'Okay', 'Good', 'Excellent'] : null;
  return (
    <div>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: q.max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={current === n}
            aria-label={`${n} of ${q.max} stars`}
            onMouseEnter={() => setHover(n)}
            onClick={() => {
              onChange(n);
              onAdvance?.(n);
            }}
            className={cx('rounded-xl p-1 transition active:scale-90', focusRing)}
          >
            <Star
              className={cx('size-12 transition @md:size-16', n <= shown ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-stone-300')}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>
      <p className="mt-3 h-7 text-lg font-medium text-stone-600" aria-live="polite">
        {shown > 0 ? (words?.[shown - 1] ?? `${shown} / ${q.max}`) : ''}
      </p>
    </div>
  );
}

export function EmojiInput({ value, onChange, onAdvance, labelId }: InputProps<'emoji'>) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-5 gap-2 @md:gap-4">
      {EMOJI_SCALE.map((e) => {
        const selected = value === e.value;
        return (
          <button
            key={e.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={e.label}
            onClick={() => {
              onChange(e.value);
              onAdvance?.(e.value);
            }}
            className={cx(
              'flex flex-col items-center gap-2 rounded-2xl border-2 px-1 py-4 transition active:scale-95',
              focusRing,
              selected ? 'border-brand bg-brand/10' : 'border-transparent hover:bg-stone-100',
              value != null && !selected && 'opacity-50',
            )}
          >
            <span className={cx('text-5xl transition @md:text-6xl', selected && 'scale-110')} aria-hidden>
              {e.emoji}
            </span>
            <span className="text-center text-xs font-medium text-stone-600 @md:text-sm">{e.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function NpsInput({ q, value, onChange, onAdvance, labelId, locale, fallbackLocale }: InputProps<'nps'>) {
  return (
    <div>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-6 gap-2 @lg:grid-cols-11">
        {Array.from({ length: 11 }, (_, n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                onChange(n);
                onAdvance?.(n);
              }}
              className={cx(
                'h-14 rounded-xl border-2 text-xl font-medium tabular-nums transition active:scale-95',
                focusRing,
                selected ? 'border-brand bg-brand text-white' : 'border-stone-200 bg-white text-stone-800 hover:border-stone-300',
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between text-sm text-stone-500">
        <span>0 · {t(q.lowLabel, locale, fallbackLocale) || 'Not likely'}</span>
        <span>{t(q.highLabel, locale, fallbackLocale) || 'Extremely likely'} · 10</span>
      </div>
    </div>
  );
}

/**
 * The slider starts EMPTY (thumb greyed, no value). A pre-filled default would be submitted by
 * visitors who never touched it and silently bias the results.
 */
export function SliderInput(p: InputProps<'slider'>) {
  const { q, value, onChange, locale, fallbackLocale, labelId, errorId, invalid } = p;
  const touched = typeof value === 'number';
  const unit = t(q.unit, locale, fallbackLocale);
  const mid = q.min + Math.round((q.max - q.min) / q.step / 2) * q.step;
  const shown = touched ? (value as number) : mid;
  const pct = ((shown - q.min) / (q.max - q.min || 1)) * 100;
  return (
    <div className="pt-12">
      <div className="relative">
        <div
          className={cx(
            'absolute -top-12 -translate-x-1/2 rounded-xl px-3 py-1.5 text-lg font-semibold tabular-nums shadow-sm transition',
            touched ? 'bg-brand text-white' : 'bg-stone-200 text-stone-500',
          )}
          style={{ left: `clamp(2rem, ${pct}%, calc(100% - 2rem))` }}
          aria-hidden
        >
          {touched ? `${shown}${unit ? ` ${unit}` : ''}` : 'Drag'}
        </div>
        <input
          type="range"
          min={q.min}
          max={q.max}
          step={q.step}
          value={shown}
          data-untouched={!touched}
          aria-labelledby={labelId}
          aria-describedby={invalid ? errorId : undefined}
          aria-valuetext={touched ? `${shown}${unit ? ` ${unit}` : ''}` : 'No value selected'}
          onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
          // Tapping exactly on the untouched thumb fires no change event — commit it anyway.
          onPointerUp={(e) => !touched && onChange(e.currentTarget.valueAsNumber)}
          onKeyUp={(e) => !touched && onChange(e.currentTarget.valueAsNumber)}
          className={cx('ff-range', focusRing)}
        />
      </div>
      <div className="mt-1 flex justify-between text-sm text-stone-500">
        <span>{t(q.minLabel, locale, fallbackLocale) || `${q.min}${unit ? ` ${unit}` : ''}`}</span>
        <span>{t(q.maxLabel, locale, fallbackLocale) || `${q.max}${unit ? ` ${unit}` : ''}`}</span>
      </div>
    </div>
  );
}
