import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CloudOff, Loader2 } from 'lucide-react';
import { uuidv4, type AnswerValue } from '@ff/form-schema';
import { FormFlow, ThankYouScreen, WelcomeScreen, type SubmitMeta } from '@ff/form-renderer';
import { applyAppUpdateIfReady } from './lib/appUpdate';
import { Engine, type CachedVersion, type Mode } from './lib/engine';
import { IdleGuard } from './screens/IdleGuard';
import { SetupScreen } from './screens/SetupScreen';
import { StatusSheet } from './screens/StatusSheet';

function readMode(): Mode {
  const slug = new URLSearchParams(window.location.search).get('f');
  return slug ? { kind: 'public', slug } : { kind: 'kiosk' };
}

type Screen = 'welcome' | 'form' | 'thanks';

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center p-8 text-center text-lg text-stone-500">{children}</div>;
}

export function App() {
  const mode = useMemo(readMode, []);
  const engine = useMemo(() => new Engine(mode), [mode]);
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const kiosk = mode.kind === 'kiosk';

  const [screen, setScreen] = useState<Screen>('welcome');
  /** Version frozen for the current visitor — a publish never changes the form mid-session. */
  const [session, setSession] = useState<{ key: number; version: CachedVersion } | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    void engine.start();
    return () => engine.stop();
  }, [engine]);

  const backToWelcome = useCallback(() => {
    setScreen('welcome');
    setSession(null);
    engine.setCanSwap(true);
    if (kiosk) applyAppUpdateIfReady();
  }, [engine, kiosk]);

  const start = () => {
    if (!state.version) return;
    engine.setCanSwap(false);
    setSession({ key: Date.now(), version: state.version });
    setScreen('form');
  };

  const submit = async (answers: Array<{ questionUid: string; value: AnswerValue }>, meta: SubmitMeta) => {
    if (!session) return;
    await engine.enqueue({
      id: uuidv4(),
      versionId: session.version.id,
      locale: session.version.doc.defaultLocale,
      startedAt: meta.startedAt,
      deviceSubmittedAt: new Date().toISOString(),
      durationMs: meta.durationMs,
      answers,
    });
    setScreen('thanks');
  };

  // Hidden staff gesture: 5 quick taps in the top-left corner.
  const onCornerTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      setStatusOpen(true);
    }
  };

  let content: React.ReactNode;
  if (state.phase === 'unpaired') {
    content = <SetupScreen engine={engine} message={state.message} unsent={state.outbox} />;
  } else if (state.phase === 'loading') {
    content = (
      <Centered>
        <Loader2 className="size-8 animate-spin text-stone-400" aria-label="Loading" />
      </Centered>
    );
  } else if (state.phase === 'no_form') {
    content = <Centered>The feedback form is not available yet. Please check back soon.</Centered>;
  } else if (state.phase === 'error' || !state.version) {
    content = <Centered>{state.message ?? 'Cannot load the form. Retrying…'}</Centered>;
  } else if (screen === 'form' && session) {
    const doc = session.version.doc;
    content = (
      <>
        <FormFlow key={session.key} doc={doc} locale={doc.defaultLocale} onSubmit={submit} onExit={backToWelcome} />
        {kiosk && <IdleGuard doc={doc} timeoutSec={doc.settings.idleTimeoutSec} onTimeout={backToWelcome} />}
      </>
    );
  } else if (screen === 'thanks' && session) {
    const doc = session.version.doc;
    content = (
      <ThankYouScreen
        doc={doc}
        locale={doc.defaultLocale}
        logoSrc={state.version.id === session.version.id ? state.logoUrl : null}
        countdownSec={kiosk ? doc.settings.thankYouSec : undefined}
        onDone={backToWelcome}
      />
    );
  } else {
    const doc = state.version.doc;
    content = <WelcomeScreen doc={doc} locale={doc.defaultLocale} logoSrc={state.logoUrl} onStart={start} />;
  }

  const showSyncBadge = state.phase === 'ready' && screen !== 'form' && (state.outbox > 0 || !state.online);

  return (
    <div className={kiosk ? 'kiosk h-full' : 'h-full'} onContextMenu={kiosk ? (e) => e.preventDefault() : undefined}>
      {content}
      {kiosk && state.phase !== 'unpaired' && <div aria-hidden className="fixed top-0 left-0 z-40 size-16" onPointerDown={onCornerTap} />}
      {showSyncBadge && (
        <div className="fixed right-4 bottom-4 z-30 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs text-stone-500 shadow-sm ring-1 ring-stone-200">
          <CloudOff className="size-3.5" />
          {state.outbox > 0 ? `${state.outbox} saved on this device · will send automatically` : 'Offline'}
        </div>
      )}
      {statusOpen && <StatusSheet engine={engine} state={state} onClose={() => setStatusOpen(false)} />}
    </div>
  );
}
