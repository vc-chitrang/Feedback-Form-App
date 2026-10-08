import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Blob storage abstraction — local disk now, S3-compatible store later. */
export interface BlobStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

const SAFE_KEY = /^[a-zA-Z0-9._-]{1,100}$/;

export class LocalDiskStorage implements BlobStorage {
  private readonly root: string;
  constructor(dir: string) {
    this.root = resolve(dir);
  }

  private path(key: string): string {
    // Keys are generated server-side, but never trust them blindly (path traversal).
    if (!SAFE_KEY.test(key) || key.includes('..')) throw new Error(`invalid storage key: ${key}`);
    return join(this.root, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.path(key), data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
}

/**
 * Supabase Storage (private bucket). Uses the service-role key, which must stay server-side.
 * Files are served to browsers only through the API's /api/assets route.
 */
export class SupabaseStorage implements BlobStorage {
  private bucketReady = false;
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket = 'logos',
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }

  private async ensureBucket() {
    if (this.bucketReady) return;
    const res = await fetch(`${this.url}/storage/v1/bucket`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false, file_size_limit: 2 * 1024 * 1024 }),
    });
    // 409/400 "already exists" is fine.
    if (!res.ok && res.status !== 409 && res.status !== 400) throw new Error(`storage bucket ${res.status}: ${await res.text()}`);
    this.bucketReady = true;
  }

  async put(key: string, data: Buffer): Promise<void> {
    if (!SAFE_KEY.test(key)) throw new Error(`invalid storage key: ${key}`);
    await this.ensureBucket();
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${key}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }),
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`storage upload ${res.status}: ${await res.text()}`);
  }

  async get(key: string): Promise<Buffer | null> {
    if (!SAFE_KEY.test(key)) return null;
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${key}`, { headers: this.headers() });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`storage download ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** In-memory storage for tests. */
export class MemoryStorage implements BlobStorage {
  private files = new Map<string, Buffer>();
  async put(key: string, data: Buffer) {
    this.files.set(key, data);
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
}
