import { useState, type FormEvent } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button, Field, TextInput } from '../components/ui';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full place-items-center bg-stone-100 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-[#7a1f2b] text-white shadow-lg shadow-rose-900/20">
            <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
              <path d="M9 11h14M9 16h10M9 21h7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="font-display text-3xl">Feedback Admin</h1>
          <p className="mt-1 text-sm text-stone-500">Sign in to manage your visitor feedback form</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200" noValidate>
          <Field label="Email" htmlFor="email">
            <TextInput id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Password" htmlFor="password">
            <TextInput
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!email || !password}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
