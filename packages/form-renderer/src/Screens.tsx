import { useEffect } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { t, type FormDoc } from '@ff/form-schema';
import { cx, focusRing, themeStyle } from './util';

interface ScreenProps {
  doc: FormDoc;
  locale: string;
  /** Resolved logo URL (client-app passes an offline-cached object URL). */
  logoSrc?: string | null;
}

function Logo({ src }: { src?: string | null }) {
  if (!src) return null;
  return <img src={src} alt="" className="max-h-24 max-w-[14rem] object-contain @2xl:max-h-32 @2xl:max-w-[18rem]" />;
}

export function WelcomeScreen({ doc, locale, logoSrc, onStart }: ScreenProps & { onStart: () => void }) {
  const L = doc.defaultLocale;
  const inputs = doc.questions.filter((q) => q.type !== 'section').length;
  const minutes = Math.max(1, Math.round((inputs * 10) / 60));
  const subtitle = t(doc.theme.welcome.subtitle, locale, L);
  return (
    <div
      style={themeStyle(doc.theme)}
      className="@container relative flex h-full flex-col items-center justify-center overflow-hidden bg-stone-50 px-8 text-center font-sans"
    >
      <div aria-hidden className="pointer-events-none absolute -top-[60%] left-1/2 aspect-square w-[160%] -translate-x-1/2 rounded-full bg-brand/[0.06]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-[70%] left-1/2 aspect-square w-[160%] -translate-x-1/2 rounded-full bg-brand/[0.04]" />
      <div className="animate-step-in relative flex max-w-2xl flex-col items-center">
        {logoSrc && (
          <div className="mb-10">
            <Logo src={logoSrc} />
          </div>
        )}
        <h1 className="font-display text-4xl leading-[1.1] text-balance text-stone-900 @2xl:text-6xl">{t(doc.theme.welcome.title, locale, L)}</h1>
        {subtitle && <p className="mt-5 text-lg text-balance text-stone-600 @2xl:text-2xl">{subtitle}</p>}
        <button
          type="button"
          onClick={onStart}
          className={cx(
            'mt-12 inline-flex h-16 items-center gap-3 rounded-full bg-brand px-12 text-xl font-medium text-white shadow-lg shadow-brand/25 transition hover:brightness-110 active:scale-[0.98] @2xl:h-20 @2xl:px-16 @2xl:text-2xl',
            focusRing,
          )}
        >
          {t(doc.theme.welcome.buttonText, locale, L) || 'Start'}
          <ArrowRight className="size-6" aria-hidden />
        </button>
        {inputs > 0 && (
          <p className="mt-6 text-sm text-stone-500 @2xl:text-base">
            About {minutes} min · {inputs} questions
          </p>
        )}
      </div>
    </div>
  );
}

export function ThankYouScreen({
  doc,
  locale,
  logoSrc,
  countdownSec,
  onDone,
}: ScreenProps & { countdownSec?: number; onDone?: () => void }) {
  const L = doc.defaultLocale;

  useEffect(() => {
    if (!countdownSec || !onDone) return;
    const timer = setTimeout(onDone, countdownSec * 1000);
    return () => clearTimeout(timer);
  }, [countdownSec, onDone]);

  return (
    <div
      style={themeStyle(doc.theme)}
      className="@container relative flex h-full flex-col items-center justify-center overflow-hidden bg-stone-50 px-8 text-center font-sans"
    >
      <div className="relative flex max-w-xl flex-col items-center">
        <div className="animate-pop grid size-24 place-items-center rounded-full bg-brand text-white shadow-xl shadow-brand/30 @2xl:size-28">
          <Check className="size-12 @2xl:size-14" strokeWidth={3} aria-hidden />
        </div>
        <h1 className="animate-step-in mt-10 font-display text-4xl leading-tight text-balance @2xl:text-6xl" role="status">
          {t(doc.theme.thankYou.title, locale, L)}
        </h1>
        <p className="animate-step-in mt-5 text-lg text-balance text-stone-600 @2xl:text-2xl">{t(doc.theme.thankYou.message, locale, L)}</p>
        {logoSrc && (
          <div className="mt-12 opacity-80">
            <Logo src={logoSrc} />
          </div>
        )}
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className={cx('mt-10 h-12 rounded-full px-6 text-stone-600 ring-1 ring-stone-300 hover:bg-white', focusRing)}
          >
            Done
          </button>
        )}
      </div>
      {countdownSec && onDone ? (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-stone-200">
          <div
            className="h-full origin-left bg-brand/60"
            style={{ animation: `ff-countdown ${countdownSec}s linear forwards` }}
          />
        </div>
      ) : null}
    </div>
  );
}
