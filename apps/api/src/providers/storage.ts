import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';

/**
 * Private object storage. Files are never served statically; every read goes through an
 * authorised API route. Swap for S3/GCS (with server-side encryption) in production.
 */
export interface StorageProvider {
  put(prefix: string, data: Buffer, ext: string): Promise<string>;
  get(key: string): Promise<Buffer>;
}

class LocalDiskStorage implements StorageProvider {
  constructor(private root: string) {}
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key');
    return full;
  }
  async put(prefix: string, data: Buffer, ext: string) {
    const key = `${prefix}/${randomUUID()}${ext}`;
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { mode: 0o600 });
    return key;
  }
  async get(key: string) {
    return readFile(this.resolve(key));
  }
}

export const storage: StorageProvider = new LocalDiskStorage(path.resolve(env.STORAGE_DIR));

const SIGNATURES: { mime: string; ext: string; magic: number[] }[] = [
  { mime: 'image/jpeg', ext: '.jpg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: '.png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', ext: '.pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mime: 'image/webp', ext: '.webp', magic: [0x52, 0x49, 0x46, 0x46] },
];

/** Detect the real file type from its first bytes; never trust the client-supplied MIME type. */
export function sniffFileType(buf: Buffer): { mime: string; ext: string } | null {
  for (const s of SIGNATURES) {
    if (s.magic.every((b, i) => buf[i] === b)) {
      if (s.mime === 'image/webp' && buf.subarray(8, 12).toString('ascii') !== 'WEBP') continue;
      return { mime: s.mime, ext: s.ext };
    }
  }
  return null;
}
