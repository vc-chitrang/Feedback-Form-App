import { useEffect, useRef, useState } from 'react';
import { themeStyle } from '@ff/form-renderer';
import type { FormDoc } from '@ff/form-schema';

const WARNING_SEC = 15;

/**
 * Kiosk privacy: if a visitor walks away mid-form, ask "Still there?" and then wipe the answers
 * so the next visitor never sees them.
 */
export function IdleGuard({ doc, timeoutSec, onTimeout }: { doc: FormDoc; timeoutSec: number; onTimeout: () => void }) {
  const [warning, setWarning] = useState<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    const reset = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setWarning(WARNING_SEC), timeoutSec * 1000);
    };
    const onActivity = () => {
      setWarning((w) => (w === null ? w : null));
      reset();
    };
    reset();
    const events = ['pointerdown', 'keydown', 'input', 'wheel', 'touchmove'] as const;
    events.forEach((e) => document.addEventListener(e, onActivity, { capture: true, passive: true }));
    return () => {
      clearTimeout(idleTimer.current);
      events.forEach((e) => document.removeEventListener(e, onActivity, { capture: true }));
    };
  }, [timeoutSec]);

  useEffect(() => {
    if (warning === null) return;
    if (warning <= 0) {
      onTimeoutRef.current();
      return;
    }
    const t = setTimeout(() => setWarning(warning - 1), 1000);
    return () => clearTimeout(t);
  }, [warning]);

  if (warning === null) return null;
  return (
    <div style={themeStyle(doc.theme)} className="fixed inset-0 z-50 grid place-items-center bg-stone-950/50 p-6 backdrop-blur-sm" role="alertdialog" aria-labelledby="idle-title">
      <div className="animate-pop w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
        <p className="font-display text-6xl text-brand tabular-nums">{warning}</p>
        <h2 id="idle-title" className="mt-4 font-display text-3xl">
          Are you still there?
        </h2>
        <p className="mt-2 text-lg text-stone-600">Your answers will be cleared for the next visitor.</p>
        <button type="button" className="mt-8 h-16 w-full rounded-full bg-brand text-xl font-medium text-white">
          I’m still here
        </button>
      </div>
    </div>
  );
}
