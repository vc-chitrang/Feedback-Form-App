import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Plus, QrCode, Tablet, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, PageLoader, TextInput, timeAgo, useConfirm, useToast } from '../components/ui';
import { api, type DeviceItem } from '../lib/api';
import { useAuth } from '../lib/auth';

interface DevicesResponse {
  liveVersion: { id: string; number: number } | null;
  publicSlug: string;
  items: DeviceItem[];
}

/** Where the client app is served. Override with VITE_CLIENT_URL (e.g. your LAN IP for phones). */
const CLIENT_URL = (import.meta.env.VITE_CLIENT_URL as string | undefined) ?? `${window.location.protocol}//${window.location.hostname}:5174`;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

export function DevicesPage() {
  const { canEdit } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<DevicesResponse | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<DevicesResponse>('/api/admin/devices'));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not load devices');
    }
  }, [toast]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const createCode = async () => {
    setCreating(true);
    try {
      setCode(await api('/api/admin/devices/pairing-codes', { method: 'POST', json: { name: name.trim() } }));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not create a code');
    } finally {
      setCreating(false);
    }
  };

  const closeAdd = () => {
    setAdding(false);
    setCode(null);
    setName('');
    void load();
  };

  const revoke = async (d: DeviceItem) => {
    const ok = await confirm({
      title: `Remove “${d.name}”?`,
      body: (
        <>
          The kiosk stops collecting feedback immediately and must be paired again to be used.
          {d.outboxSize > 0 && (
            <strong className="mt-2 block text-red-700">
              It still has {d.outboxSize} unsent response{d.outboxSize === 1 ? '' : 's'}. Bring it online and let it sync first, or they will be lost.
            </strong>
          )}
        </>
      ),
      confirmText: 'Remove device',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/devices/${d.id}`, { method: 'DELETE' });
      toast('success', 'Device removed');
      void load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not remove device');
    }
  };

  if (!data) return <PageLoader />;
  const publicUrl = `${CLIENT_URL}/?f=${encodeURIComponent(data.publicSlug)}`;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="Devices & QR"
        description="Kiosk tablets pair once with a code. Visitors can also scan the QR code to answer on their own phone."
        actions={
          canEdit && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add kiosk
            </Button>
          )
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          {data.items.length === 0 ? (
            <EmptyState icon={<Tablet />} title="No kiosks paired">
              Click “Add kiosk”, then open the client app on the tablet and enter the code.
            </EmptyState>
          ) : (
            <>
            {/* Phones: one card per kiosk. */}
            <ul className="divide-y divide-stone-100 lg:hidden">
              {data.items.map((d) => {
                const online = d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
                const outdated = data.liveVersion && d.runningVersion && d.runningVersion.id !== data.liveVersion.id;
                return (
                  <li key={d.id} className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-stone-900">{d.name}</span>
                      <span className="flex items-center gap-1.5 text-sm">
                        <span className={`size-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-stone-500">
                      <span>Seen {timeAgo(d.lastSeenAt)}</span>
                      {d.runningVersion && <span>· v{d.runningVersion.number}</span>}
                      {d.outboxSize > 0 && <Badge tone="amber">{d.outboxSize} waiting to sync</Badge>}
                      {outdated && <Badge tone="amber">Updates to v{data.liveVersion!.number} when idle</Badge>}
                    </p>
                    {canEdit && (
                      <Button size="sm" variant="secondary" className="w-full" icon={<Trash2 className="size-4" />} onClick={() => void revoke(d)}>
                        Remove
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">Kiosk</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="hidden px-5 py-3 font-medium sm:table-cell">Form version</th>
                    <th className="hidden px-5 py-3 text-right font-medium md:table-cell">Waiting to sync</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {data.items.map((d) => {
                    const online = d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
                    const outdated = data.liveVersion && d.runningVersion && d.runningVersion.id !== data.liveVersion.id;
                    return (
                      <tr key={d.id}>
                        <td className="px-5 py-3 font-medium text-stone-900">{d.name}</td>
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-2">
                            <span className={`size-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                            {online ? 'Online' : 'Offline'}
                            <span className="text-xs text-stone-400">{timeAgo(d.lastSeenAt)}</span>
                          </span>
                        </td>
                        <td className="hidden px-5 py-3 sm:table-cell">
                          {d.runningVersion ? (
                            <span className="flex items-center gap-2">
                              v{d.runningVersion.number}
                              {outdated && <Badge tone="amber">Switches to v{data.liveVersion!.number} when idle</Badge>}
                            </span>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                        <td className="hidden px-5 py-3 text-right tabular-nums md:table-cell">{d.outboxSize > 0 ? <Badge tone="amber">{d.outboxSize}</Badge> : <span className="text-stone-400">0</span>}</td>
                        <td className="px-5 py-3 text-right">
                          {canEdit && (
                            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void revoke(d)}>
                              Remove
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <QrCode className="size-4" /> Visitor QR code
          </h2>
          <p className="mb-4 text-sm text-stone-500">Print this near the exit. Visitors fill the same live form on their phone.</p>
          <div className="mx-auto w-fit rounded-xl bg-white p-3 ring-1 ring-stone-200">
            <QRCodeSVG value={publicUrl} size={200} level="M" marginSize={1} />
          </div>
          <div className="mt-4 flex gap-2">
            <TextInput readOnly value={publicUrl} aria-label="Public form link" onFocus={(e) => e.target.select()} />
            <Button
              aria-label="Copy link"
              icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={() => {
                void navigator.clipboard?.writeText(publicUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            />
          </div>
          <p className="mt-3 text-xs text-stone-500">
            For phones on your Wi-Fi, set <code className="rounded bg-stone-100 px-1">VITE_CLIENT_URL</code> to this computer’s network address.
          </p>
        </Card>
      </div>

      <Modal
        open={adding}
        onClose={closeAdd}
        title={code ? 'Enter this code on the kiosk' : 'Add a kiosk'}
        footer={
          code ? (
            <Button variant="primary" onClick={closeAdd}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={closeAdd}>Cancel</Button>
              <Button variant="primary" loading={creating} disabled={!name.trim()} onClick={() => void createCode()}>
                Create pairing code
              </Button>
            </>
          )
        }
      >
        {code ? (
          <div className="text-center">
            <p className="font-mono text-4xl font-semibold tracking-[0.2em] text-stone-900">{code.code}</p>
            <p className="mt-3 text-sm text-stone-500">
              Open the client app on the tablet and type this code. It works once and expires at{' '}
              {new Date(code.expiresAt).toLocaleTimeString(undefined, { timeStyle: 'short' })}.
            </p>
          </div>
        ) : (
          <Field label="Kiosk name" hint="So you can tell kiosks apart, e.g. “Main exit” or “Gallery 2”.">
            <TextInput autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && void createCode()} />
          </Field>
        )}
      </Modal>
    </div>
  );
}
