import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import {
  checkAnswer,
  localDateISO,
  t,
  validateSubmission,
  type AnswerValue,
  type FormDoc,
} from '@ff/form-schema';
import { AUTO_ADVANCE_TYPES, QuestionInput } from './QuestionInput';
import { cx, focusRing, themeStyle } from './util';

export interface SubmitMeta {
  startedAt: string;
  durationMs: number;
}

export interface FormFlowProps {
  doc: FormDoc;
  locale: string;
  onSubmit: (answers: Array<{ questionUid: string; value: AnswerValue }>, meta: SubmitMeta) => void | Promise<void>;
  /** Back pressed on the first question (e.g. return to the welcome screen). */
  onExit?: () => void;
  /** Optional controlled step (admin preview keeps it in sync with the selected question). */
  step?: number;
  onStepChange?: (step: number) => void;
}

/**
 * One question per screen with progress, validation, auto-advance and double-submit protection.
 * Answers live only in component state: unmounting (idle reset) wipes them.
 */
export function FormFlow({ doc, locale, onSubmit, onExit, step: controlledStep, onStepChange }: FormFlowProps) {
  const qs = doc.questions;
  const L = doc.defaultLocale;
  const [internalStep, setInternalStep] = useState(0);
  const step = Math.min(Math.max(controlledStep ?? internalStep, 0), Math.max(qs.length - 1, 0));
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef(new Date());
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const baseId = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(advanceTimer.current);
    };
  }, []);

  // A pending auto-advance must never fire after the visitor already moved on.
  useEffect(() => () => clearTimeout(advanceTimer.current), [step]);

  const q = qs[step];
  if (!q) {
    return (
      <div style={themeStyle(doc.theme)} className="@container grid h-full place-items-center bg-stone-50 p-8 text-center text-stone-500">
        This form has no questions yet.
      </div>
    );
  }

  const isLast = step === qs.length - 1;
  const today = { earliest: localDateISO(), latest: localDateISO() };
  const labelId = `${baseId}-label`;
  const errorId = `${baseId}-error`;
  const error = errors[q.uid];

  const setStep = (s: number) => {
    setInternalStep(s);
    onStepChange?.(s);
  };

  const setAnswer = (uid: string, v: unknown) => {
    setAnswers((a) => ({ ...a, [uid]: v }));
    setErrors((e) => {
      if (!e[uid]) return e;
      const next = { ...e };
      delete next[uid];
      return next;
    });
  };

  const submit = async (finalAnswers: Record<string, unknown>) => {
    if (submitting) return; // double-tap guard
    const result = validateSubmission(doc, finalAnswers, { today });
    if (!result.ok) {
      setErrors(result.errors);
      const firstBad = qs.findIndex((x) => result.errors[x.uid]);
      if (firstBad >= 0) setStep(firstBad);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(
        Object.entries(result.values).map(([questionUid, value]) => ({ questionUid, value })),
        { startedAt: startedAt.current.toISOString(), durationMs: Date.now() - startedAt.current.getTime() },
      );
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };

  const goNext = (override?: unknown) => {
    clearTimeout(advanceTimer.current);
    const value = override !== undefined ? override : answers[q.uid];
    const r = checkAnswer(q, value, { today });
    if (!r.ok) {
      setErrors((e) => ({ ...e, [q.uid]: r.error }));
      return;
    }
    if (isLast) void submit({ ...answers, [q.uid]: value });
    else setStep(step + 1);
  };

  const goBack = () => {
    clearTimeout(advanceTimer.current);
    if (step > 0) setStep(step - 1);
    else onExit?.();
  };

  const tapToAdvance = AUTO_ADVANCE_TYPES.includes(q.type);
  /** Called after a tap on a choice/scale, or Enter in a text field. */
  const onAdvance = (v: unknown) => {
    clearTimeout(advanceTimer.current);
    if (!tapToAdvance) return goNext(v); // Enter key: move on immediately
    if (isLast) return; // never auto-submit; the visitor presses Submit
    // Short pause so the visitor sees their selection register before the screen moves.
    advanceTimer.current = setTimeout(() => goNext(v), 320);
  };

  const progress = ((step + 1) / qs.length) * 100;
  const isSection = q.type === 'section';

  return (
    <div style={themeStyle(doc.theme)} className="@container flex h-full flex-col bg-stone-50 font-sans text-stone-900">
      <header className="px-6 pt-5 @2xl:px-12 @2xl:pt-8 [@media(max-height:520px)]:pt-3">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between text-sm font-medium text-stone-500">
            <span>
              {step + 1} of {qs.length}
            </span>
            {!q.required && !isSection && <span>Optional</span>}
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={qs.length}
            aria-valuenow={step + 1}
            aria-label="Progress"
          >
            <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-8 @2xl:px-12 @2xl:py-12 [@media(max-height:520px)]:py-4">
        <div key={q.uid} className="animate-step-in mx-auto max-w-2xl">
          <h2
            id={labelId}
            ref={headingRef}
            tabIndex={-1}
            className={cx(
              'font-display leading-tight text-balance text-stone-900 outline-none',
              isSection ? 'text-3xl @2xl:text-5xl [@media(max-height:520px)]:text-2xl' : 'text-2xl @2xl:text-4xl [@media(max-height:520px)]:text-2xl',
            )}
          >
            {t(q.label, locale, L) || <span className="text-stone-300">Untitled question</span>}
            {q.required && !isSection && (
              <span className="text-brand" aria-label="required">
                {' '}
                *
              </span>
            )}
          </h2>
          {q.help && t(q.help, locale, L) && <p className="mt-3 text-lg text-stone-500 @2xl:text-xl">{t(q.help, locale, L)}</p>}

          {!isSection && (
            <div className="mt-8 [@media(max-height:520px)]:mt-4">
              <QuestionInput
                q={q}
                value={answers[q.uid] ?? null}
                onChange={(v) => setAnswer(q.uid, v)}
                onAdvance={onAdvance}
                locale={locale}
                fallbackLocale={L}
                invalid={!!error}
                labelId={labelId}
                errorId={errorId}
              />
            </div>
          )}

          {error && (
            <p id={errorId} role="alert" className="mt-5 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-red-800">
              <AlertCircle className="size-5 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white/90 px-6 py-4 backdrop-blur @2xl:px-12 [@media(max-height:520px)]:py-2">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          {step > 0 || onExit ? (
            <button
              type="button"
              onClick={goBack}
              className={cx('flex h-14 items-center gap-2 rounded-full px-5 text-lg text-stone-600 hover:bg-stone-100', focusRing)}
            >
              <ArrowLeft className="size-5" aria-hidden /> Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => goNext()}
            disabled={submitting}
            className={cx(
              'flex h-14 min-w-36 items-center justify-center gap-2 rounded-full bg-brand px-8 text-lg font-medium text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60',
              focusRing,
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden /> Sending…
              </>
            ) : isLast ? (
              'Submit'
            ) : (
              <>
                {isSection ? 'Continue' : 'Next'} <ArrowRight className="size-5" aria-hidden />
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
