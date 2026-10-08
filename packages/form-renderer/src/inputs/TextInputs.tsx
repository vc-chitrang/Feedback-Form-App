import { useMemo, useState } from 'react';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import { charLength, localDateISO, suggestEmail, t, TEXT_LIMITS } from '@ff/form-schema';
import { cx, focusRing } from '../util';
import type { InputProps } from './types';

const fieldClass = (invalid: boolean) =>
  cx(
    'h-16 w-full rounded-2xl border-2 bg-white px-5 text-xl text-stone-900 outline-none transition placeholder:text-stone-400',
    invalid ? 'border-red-400' : 'border-stone-200 focus:border-brand',
    focusRing,
  );

/**
 * autoComplete="off" everywhere: on a shared kiosk the browser must never offer the
 * previous visitor's name, email or phone number.
 */
function a11y(p: Pick<InputProps, 'labelId' | 'errorId' | 'invalid'>) {
  return {
    'aria-labelledby': p.labelId,
    'aria-describedby': p.invalid ? p.errorId : undefined,
    'aria-invalid': p.invalid || undefined,
    autoComplete: 'off',
  } as const;
}

function Counter({ value, max }: { value: string; max: number }) {
  const n = charLength(value);
  return (
    <p className={cx('mt-2 text-right text-sm', n > max ? 'text-red-600' : 'text-stone-400')} aria-live="polite">
      {n}/{max}
    </p>
  );
}

export function ShortTextInput(p: InputProps<'short_text'>) {
  const { q, value, onChange, onAdvance, locale, fallbackLocale, invalid } = p;
  const v = typeof value === 'string' ? value : '';
  const max = q.maxLength ?? TEXT_LIMITS.shortText;
  return (
    <div>
      <input
        {...a11y(p)}
        autoFocus
        lang={locale}
        type="text"
        autoCapitalize={q.format === 'name' ? 'words' : 'sentences'}
        maxLength={max + 20}
        value={v}
        placeholder={t(q.placeholder, locale, fallbackLocale)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onAdvance?.(v)}
        className={fieldClass(invalid)}
      />
      {charLength(v) > max * 0.8 && <Counter value={v} max={max} />}
    </div>
  );
}

export function LongTextInput(p: InputProps<'long_text'>) {
  const { q, value, onChange, locale, fallbackLocale, invalid } = p;
  const v = typeof value === 'string' ? value : '';
  const max = q.maxLength ?? TEXT_LIMITS.longText;
  return (
    <div>
      <textarea
        {...a11y(p)}
        autoFocus
        lang={locale}
        rows={5}
        value={v}
        placeholder={t(q.placeholder, locale, fallbackLocale)}
        onChange={(e) => onChange(e.target.value)}
        className={cx(fieldClass(invalid), 'h-auto min-h-40 resize-none py-4 leading-relaxed')}
      />
      <Counter value={v} max={max} />
    </div>
  );
}

export function EmailInput(p: InputProps<'email'>) {
  const { q, value, onChange, onAdvance, locale, fallbackLocale, invalid } = p;
  const v = typeof value === 'string' ? value : '';
  const suggestion = useMemo(() => (v.includes('@') ? suggestEmail(v) : null), [v]);
  return (
    <div>
      <input
        {...a11y(p)}
        autoFocus
        type="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={TEXT_LIMITS.email}
        value={v}
        placeholder={t(q.placeholder, locale, fallbackLocale) || 'name@example.com'}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onAdvance?.(v)}
        className={fieldClass(invalid)}
      />
      {suggestion && (
        <button
          type="button"
          onClick={() => onChange(suggestion)}
          className={cx('mt-3 rounded-full bg-amber-50 px-4 py-2 text-left text-amber-900 ring-1 ring-amber-200', focusRing)}
        >
          Did you mean <strong className="font-semibold">{suggestion}</strong>?
        </button>
      )}
    </div>
  );
}

let countryNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    countryNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function PhoneInput(p: InputProps<'phone'>) {
  const { q, value, onChange, onAdvance, invalid } = p;
  const [country, setCountry] = useState<CountryCode>((q.defaultCountry as CountryCode) ?? 'IN');
  const prefix = `+${getCountryCallingCode(country)} `;
  const v = typeof value === 'string' ? value : '';
  // The stored draft value is "+CC national"; show only the national part in the box.
  const national = v.startsWith(prefix) ? v.slice(prefix.length) : v;

  const countries = useMemo(() => {
    const list = getCountries().map((c) => ({ code: c, name: countryName(c), dial: getCountryCallingCode(c) }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    const first = list.find((c) => c.code === ((q.defaultCountry as CountryCode) ?? 'IN'));
    return first ? [first, ...list.filter((c) => c !== first)] : list;
  }, [q.defaultCountry]);

  const emit = (c: CountryCode, nat: string) => {
    const digits = nat.replace(/[^\d\s-]/g, '');
    onChange(digits.trim() ? `+${getCountryCallingCode(c)} ${digits}` : null);
  };

  return (
    <div className="flex gap-3">
      <select
        aria-label="Country code"
        value={country}
        onChange={(e) => {
          const c = e.target.value as CountryCode;
          setCountry(c);
          emit(c, national);
        }}
        className={cx('h-16 w-36 shrink-0 rounded-2xl border-2 border-stone-200 bg-white px-3 text-lg outline-none focus:border-brand', focusRing)}
      >
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} +{c.dial}
          </option>
        ))}
      </select>
      <input
        {...a11y(p)}
        autoFocus
        type="tel"
        inputMode="tel"
        maxLength={20}
        value={national}
        placeholder="98765 43210"
        onChange={(e) => emit(country, e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onAdvance?.(v)}
        className={fieldClass(invalid)}
      />
    </div>
  );
}

export function NumberInput(p: InputProps<'number'>) {
  const { q, value, onChange, onAdvance, locale, fallbackLocale, invalid } = p;
  const text = value === null || value === undefined ? '' : String(value);
  const num = Number(text);
  const step = (delta: number) => {
    const base = Number.isFinite(num) && text !== '' ? num : (q.min ?? 0) - delta;
    let next = base + delta;
    if (q.min !== undefined) next = Math.max(q.min, next);
    if (q.max !== undefined) next = Math.min(q.max, next);
    onChange(next);
  };
  const unit = t(q.unit, locale, fallbackLocale);
  const btn = cx(
    'grid size-16 shrink-0 place-items-center rounded-2xl border-2 border-stone-200 bg-white text-3xl text-stone-700 active:scale-95',
    focusRing,
  );
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Decrease" className={btn} onClick={() => step(-1)}>
        −
      </button>
      <div className="relative flex-1">
        <input
          {...a11y(p)}
          autoFocus
          type="text"
          inputMode={q.integer ? 'numeric' : 'decimal'}
          value={text}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.-]/g, '') || null)}
          onKeyDown={(e) => e.key === 'Enter' && onAdvance?.(value)}
          className={cx(fieldClass(invalid), 'text-center text-2xl tabular-nums')}
        />
        {unit && <span className="pointer-events-none absolute top-1/2 right-5 -translate-y-1/2 text-stone-400">{unit}</span>}
      </div>
      <button type="button" aria-label="Increase" className={btn} onClick={() => step(1)}>
        +
      </button>
    </div>
  );
}

export function DateInput(p: InputProps<'date'>) {
  const { q, value, onChange, invalid } = p;
  const today = localDateISO();
  return (
    <input
      {...a11y(p)}
      type="date"
      value={typeof value === 'string' ? value : ''}
      max={q.disallowFuture ? today : undefined}
      min={q.disallowPast ? today : '1900-01-01'}
      onChange={(e) => onChange(e.target.value || null)}
      className={cx(fieldClass(invalid), 'max-w-sm')}
    />
  );
}
