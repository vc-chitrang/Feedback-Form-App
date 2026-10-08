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
