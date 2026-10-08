import { useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, Tablet } from 'lucide-react';
import type { Engine } from '../lib/engine';

/** Formats input as XXXX-XXXX using the unambiguous pairing alphabet. */
function formatCode(raw: string) {
  const s = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

export function SetupScreen({ engine, message, unsent }: { engine: Engine; message: string | null; unsent: number }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await engine.pair(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pairing failed');
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full place-items-center bg-stone-100 p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-200">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-stone-900 text-white">
          <Tablet className="size-7" />
        </div>
        <h1 className="font-display text-3xl">Set up this kiosk</h1>
        <p className="mt-2 text-stone-500">
          In the admin app, open <strong>Devices & QR → Add kiosk</strong> and enter the code here.
        </p>
        {message && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p>}
        {unsent > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {unsent} response{unsent === 1 ? ' is' : 's are'} saved on this tablet and will be sent after pairing.
          </p>
        )}
        <label htmlFor="code" className="sr-only">
          Pairing code
        </label>
        <input
          id="code"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          value={code}
          onChange={(e) => setCode(formatCode(e.target.value))}
          placeholder="XXXX-XXXX"
          className="mt-6 h-16 w-full rounded-2xl border-2 border-stone-200 text-center font-mono text-3xl tracking-[0.25em] uppercase outline-none focus:border-stone-900"
        />
        {error && (
          <p role="alert" className="mt-3 flex items-center justify-center gap-2 text-sm text-red-700">
            <AlertCircle className="size-4" /> {error}
          </p>
        )}
        <button
          type="submit"
          disabled={code.replace('-', '').length !== 8 || busy}
          className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-stone-900 text-lg font-medium text-white transition disabled:opacity-40"
        >
          {busy && <Loader2 className="size-5 animate-spin" />} Pair kiosk
        </button>
        <p className="mt-6 text-xs text-stone-400">Visitors using their own phone should scan the QR code at the exit instead.</p>
      </form>
    </div>
  );
}
