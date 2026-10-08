import { useState } from 'react';
import { RefreshCw, Unplug, X } from 'lucide-react';
import { APP_VERSION, type Engine, type EngineState } from '../lib/engine';

/** Staff-only panel, opened by tapping the top-left corner 5 times quickly. */
export function StatusSheet({ engine, state, onClose }: { engine: Engine; state: EngineState; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-stone-100 py-2 text-sm">
      <dt className="text-stone-500">{k}</dt>
      <dd className="text-right font-medium text-stone-900">{v}</dd>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-stone-950/60 p-6" role="dialog" aria-modal="true" aria-label="Kiosk status">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Kiosk status</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full hover:bg-stone-100">
            <X className="size-5" />
          </button>
        </div>
        <dl>
          {row('Organisation', state.device?.tenantName ?? '—')}
          {row('Kiosk', state.device?.name ?? '—')}
          {row('Form version', state.version ? `v${state.version.number}${state.pendingUpdate ? ' (update ready)' : ''}` : '—')}
          {row('Connection', state.online ? 'Online' : 'Offline')}
          {row('Waiting to send', state.outbox)}
          {row('Rejected by server', state.failed)}
          {row('Last sync', state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleTimeString() : 'never')}
          {row('App', APP_VERSION)}
        </dl>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await Promise.all([engine.sync(true), engine.checkForUpdate()]);
              setBusy(false);
            }}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-stone-900 font-medium text-white disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} /> Sync now
          </button>
        </div>
        <div className="mt-6 rounded-2xl bg-red-50 p-4">
          <p className="text-sm text-red-900">
            Unpair this kiosk? Type <strong>UNPAIR</strong> to confirm.
            {state.outbox > 0 && ` ${state.outbox} unsent responses stay on this tablet.`}
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              className="h-11 min-w-0 flex-1 rounded-xl border-2 border-red-200 bg-white px-3 outline-none focus:border-red-500"
              aria-label="Type UNPAIR to confirm"
            />
            <button
              type="button"
              disabled={confirmText !== 'UNPAIR'}
              onClick={() => void engine.unpair().then(onClose)}
              className="flex items-center gap-2 rounded-xl bg-red-600 px-4 font-medium text-white disabled:opacity-40"
            >
              <Unplug className="size-4" /> Unpair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
