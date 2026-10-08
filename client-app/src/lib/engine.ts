import { createStore, del, entries, get, set } from 'idb-keyval';
import type { FormDoc, SubmissionPayload } from '@ff/form-schema';

export const APP_VERSION = '0.1.0';

/** API host: empty locally (Vite proxy); VITE_API_BASE for the hosted build. */
const API = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');
const apiUrl = (path: string) => (path.startsWith('/api') ? API + path : path);

export type Mode = { kind: 'kiosk' } | { kind: 'public'; slug: string };

export interface CachedVersion {
  id: string;
  number: number;
  doc: FormDoc;
  /** Logo bytes cached so the welcome screen works fully offline. */
  logo: Blob | null;
}

interface DeviceInfo {
  token: string;
  deviceId: string;
  deviceName: string;
  tenantName: string;
}

interface OutboxItem {
  scope: string;
  payload: SubmissionPayload;
  createdAt: number;
  error?: string;
}

export interface EngineState {
  phase: 'loading' | 'unpaired' | 'ready' | 'no_form' | 'error';
  version: CachedVersion | null;
  logoUrl: string | null;
  /** A newer version is downloaded and waits for the welcome screen. */
  pendingUpdate: boolean;
  online: boolean;
  outbox: number;
  failed: number;
  lastSyncAt: number | null;
  message: string | null;
  device: { name: string; tenantName: string } | null;
}

// IndexedDB stores (survive reloads, power cuts and browser restarts).
const meta = createStore('ff-client', 'meta');
const outbox = createStore('ff-client-outbox', 'outbox');
const dead = createStore('ff-client-dead', 'dead');

const POLL_MS = 60_000;
const HEARTBEAT_MS = 60_000;
const SYNC_TICK_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

export class PairingError extends Error {}

/**
 * Offline-first runtime for kiosk and public (QR) mode:
 *  - shows the cached form instantly, polls for new versions, downloads them fully, and swaps
 *    ONLY when the app says it is safe (idle on the welcome screen);
 *  - stores every submission in an IndexedDB outbox first, then syncs with exponential backoff.
 *    The client-generated id makes retries idempotent on the server.
 */
export class Engine {
  state: EngineState = {
    phase: 'loading',
    version: null,
    logoUrl: null,
    pendingUpdate: false,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    outbox: 0,
    failed: 0,
    lastSyncAt: null,
    message: null,
    device: null,
  };

  private listeners = new Set<() => void>();
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private device: DeviceInfo | null = null;
  private canSwap = true;
  private syncing = false;
  private checking = false;
  private failures = 0;
  private nextSyncAt = 0;
  private runId = 0;
  private readonly scope: string;

  constructor(private readonly mode: Mode) {
    this.scope = mode.kind === 'kiosk' ? 'kiosk' : `public:${mode.slug}`;
  }

  // ---------- subscription (useSyncExternalStore) ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  private patch(p: Partial<EngineState>) {
    this.state = { ...this.state, ...p };
    for (const fn of this.listeners) fn();
  }

  private get base() {
    return API + (this.mode.kind === 'kiosk' ? '/api/client' : `/api/public/${encodeURIComponent(this.mode.slug)}`);
  }
  private get versionKey() {
    return `version:${this.scope}`;
  }
  private get pendingKey() {
    return `pending:${this.scope}`;
  }
  private headers(json = false): HeadersInit {
    const h: Record<string, string> = {};
    if (json) h['Content-Type'] = 'application/json';
    if (this.mode.kind === 'kiosk' && this.device) h.Authorization = `Bearer ${this.device.token}`;
    return h;
  }

  // ---------- lifecycle ----------
  async start() {
    this.stop();
    // A newer start()/stop() call invalidates this run (React StrictMode mounts twice).
    const run = this.runId;
    const stale = () => run !== this.runId;
    if (this.mode.kind === 'kiosk') {
      this.device = (await get<DeviceInfo>('device', meta)) ?? null;
      if (stale()) return;
      if (!this.device) {
        await this.refreshCounts();
        this.patch({ phase: 'unpaired', device: null });
        return;
      }
      this.patch({ device: { name: this.device.deviceName, tenantName: this.device.tenantName } });
    }

    // Starting up = nobody is mid-form, so a pending version can be applied right away.
    const pending = await get<CachedVersion>(this.pendingKey, meta);
    if (pending) await this.promotePending();
    const cached = await get<CachedVersion>(this.versionKey, meta);
    if (stale()) return;
    if (cached) this.showVersion(cached);
    await this.refreshCounts();
    if (stale()) return;

    void this.checkForUpdate();
    void this.sync(true);
    if (this.mode.kind === 'kiosk') void this.heartbeat();

    this.timers.push(setInterval(() => void this.checkForUpdate(), POLL_MS));
    this.timers.push(setInterval(() => void this.sync(), SYNC_TICK_MS));
    if (this.mode.kind === 'kiosk') this.timers.push(setInterval(() => void this.heartbeat(), HEARTBEAT_MS));
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
  }

  stop() {
    this.runId += 1;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }

  private onOnline = () => {
    this.patch({ online: true });
    this.nextSyncAt = 0;
    void this.sync(true);
    void this.checkForUpdate();
  };
  private onOffline = () => this.patch({ online: false });

  // ---------- pairing ----------
  async pair(code: string) {
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/client/pair'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, appVersion: APP_VERSION }),
      });
    } catch {
      throw new PairingError('Cannot reach the server. Check the Wi-Fi connection.');
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new PairingError(body?.error?.message ?? 'Pairing failed');
    const info: DeviceInfo = { token: body.deviceToken, deviceId: body.deviceId, deviceName: body.deviceName, tenantName: body.tenantName };
    await set('device', info, meta);
    this.patch({ phase: 'loading', message: null });
    await this.start();
  }

  /** Remove pairing. Unsent responses are kept and sent if the device is paired again to the same organisation. */
  async unpair() {
    this.stop();
    await del('device', meta);
    await del(this.versionKey, meta);
    await del(this.pendingKey, meta);
    this.device = null;
    if (this.state.logoUrl) URL.revokeObjectURL(this.state.logoUrl);
    this.patch({ phase: 'unpaired', version: null, logoUrl: null, device: null, pendingUpdate: false });
  }

  private async handleRevoked() {
    await this.unpair();
    this.patch({ message: 'This kiosk was removed in the admin app. Pair it again to continue.' });
  }

  // ---------- versions ----------
  /** App tells the engine whether a visitor is using the form right now. */
  setCanSwap(v: boolean) {
    this.canSwap = v;
    if (v && this.state.pendingUpdate) void this.promotePending();
  }

  async checkForUpdate() {
    if (this.checking || this.state.phase === 'unpaired') return;
    this.checking = true;
    try {
      const res = await fetch(`${this.base}/live`, { headers: this.headers() });
      if (res.status === 401) return void (await this.handleRevoked());
      if (!res.ok) throw new Error(`live ${res.status}`);
      const body = (await res.json()) as { tenantName: string; live: { versionId: string; number: number } | null };
      this.patch({ online: true });

      if (!body.live) {
        if (!this.state.version) this.patch({ phase: 'no_form' });
        return;
      }
      if (body.live.versionId === this.state.version?.id) return;
      const pending = await get<CachedVersion>(this.pendingKey, meta);
      if (pending?.id !== body.live.versionId) {
        const downloaded = await this.download(body.live.versionId);
        // Only a COMPLETE download is stored; a partial one leaves the current version in place.
        await set(this.pendingKey, downloaded, meta);
      }
      this.patch({ pendingUpdate: true });
      if (this.canSwap || !this.state.version) await this.promotePending();
    } catch {
      this.patch({ online: false });
      if (!this.state.version && this.state.phase === 'loading') {
        this.patch({ phase: 'error', message: 'Cannot load the form. Waiting for a connection…' });
      }
    } finally {
      this.checking = false;
    }
  }

  private async download(versionId: string): Promise<CachedVersion> {
    const res = await fetch(`${this.base}/versions/${encodeURIComponent(versionId)}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`version ${res.status}`);
    const v = (await res.json()) as { id: string; number: number; doc: FormDoc };
    let logo: Blob | null = null;
    if (v.doc.theme.logoUrl) {
      const lr = await fetch(apiUrl(v.doc.theme.logoUrl));
      if (lr.ok) logo = await lr.blob();
      else if (lr.status !== 404) throw new Error(`logo ${lr.status}`); // retry later; 404 → no logo
    }
    return { id: v.id, number: v.number, doc: v.doc, logo };
  }

  private async promotePending() {
    const p = await get<CachedVersion>(this.pendingKey, meta);
    if (!p) return;
    await set(this.versionKey, p, meta);
    await del(this.pendingKey, meta);
    this.showVersion(p);
    if (this.mode.kind === 'kiosk') void this.heartbeat();
  }

  private showVersion(v: CachedVersion) {
    if (this.state.logoUrl) URL.revokeObjectURL(this.state.logoUrl);
    this.patch({ version: v, logoUrl: v.logo ? URL.createObjectURL(v.logo) : null, phase: 'ready', pendingUpdate: false, message: null });
  }

  // ---------- submissions ----------
  async enqueue(payload: SubmissionPayload) {
    const item: OutboxItem = { scope: this.scope, payload, createdAt: Date.now() };
    await set(payload.id, item, outbox); // durable BEFORE we show "thank you"
    await this.refreshCounts();
    void this.sync(true);
  }

  async sync(force = false) {
    if (this.syncing || this.state.phase === 'unpaired') return;
    if (!force && Date.now() < this.nextSyncAt) return;
    this.syncing = true;
    try {
      const items = (await entries<string, OutboxItem>(outbox)).filter(([, i]) => i.scope === this.scope).sort((a, b) => a[1].createdAt - b[1].createdAt);
      for (const [key, item] of items) {
        let res: Response;
        try {
          res = await fetch(`${this.base}/submissions`, { method: 'POST', headers: this.headers(true), body: JSON.stringify(item.payload) });
        } catch {
          return this.backoff();
        }
        if (res.ok) {
          await del(key, outbox);
          this.failures = 0;
          continue;
        }
        if (res.status === 401 && this.mode.kind === 'kiosk') return void (await this.handleRevoked());
        if (res.status === 429 || res.status >= 500) return this.backoff();
        // Permanent rejection (validation): park it in the dead-letter store, never drop silently.
        const body = await res.json().catch(() => null);
        await set(key, { ...item, error: body?.error?.message ?? `HTTP ${res.status}` }, dead);
        await del(key, outbox);
      }
      this.patch({ online: true, lastSyncAt: Date.now() });
    } finally {
      this.syncing = false;
      await this.refreshCounts();
    }
  }

  private backoff() {
    this.failures += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 5000 * 2 ** (this.failures - 1));
    this.nextSyncAt = Date.now() + delay * (0.5 + Math.random() * 0.5); // jitter avoids retry storms
    this.patch({ online: false });
  }

  private async refreshCounts() {
    const [o, d] = await Promise.all([entries<string, OutboxItem>(outbox), entries<string, OutboxItem>(dead)]);
    this.patch({ outbox: o.filter(([, i]) => i.scope === this.scope).length, failed: d.filter(([, i]) => i.scope === this.scope).length });
  }

  private async heartbeat() {
    if (this.mode.kind !== 'kiosk' || !this.device) return;
    try {
      const res = await fetch(apiUrl('/api/client/heartbeat'), {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({ runningVersionId: this.state.version?.id ?? null, outboxSize: this.state.outbox, appVersion: APP_VERSION }),
      });
      if (res.status === 401) await this.handleRevoked();
    } catch {
      /* offline — next heartbeat will report */
    }
  }
}
