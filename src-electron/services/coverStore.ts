import fs from 'node:fs';
import path from 'node:path';
import { app, nativeImage } from 'electron';

const SCHEMA = 'mytunes';

export function coversDir(): string {
  const dir = path.join(app.getPath('userData'), 'covers');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getCoverPath(songId: string): string {
  return path.join(coversDir(), `${songId}.jpg`);
}

export function coverExists(songId: string): boolean {
  return Boolean(songId) && fs.existsSync(getCoverPath(songId));
}

export function coverFileUrl(songId: string): string {
  return `${SCHEMA}://cover/${songId}`;
}

/** Attach runtime cover URL when a file exists; never persist this field to disk. */
export function attachCoverUrl<T extends { id: string; coverFileUrl?: string }>(song: T): T {
  if (coverExists(song.id)) {
    song.coverFileUrl = coverFileUrl(song.id);
  } else {
    delete song.coverFileUrl;
  }
  return song;
}

/** Strip runtime-only cover URL before writing song.json. */
export function stripCoverUrlForPersist<T extends { coverFileUrl?: string }>(song: T): T {
  const next = { ...song };
  delete next.coverFileUrl;
  return next;
}

export function deleteCover(songId: string): void {
  const file = getCoverPath(songId);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

export function copyCover(fromSongId: string, toSongId: string): boolean {
  if (!fromSongId || !toSongId || fromSongId === toSongId) return false;
  const src = getCoverPath(fromSongId);
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, getCoverPath(toSongId));
  return true;
}

/**
 * Write JPEG bytes (raw or base64, with or without data-URL prefix) as the song cover.
 * Non-JPEG images are re-encoded via Electron nativeImage.
 */
export function writeCoverJpeg(songId: string, jpegBase64OrBytes: string | Buffer): string {
  if (!songId) throw new Error('Song id required');
  let buf: Buffer;
  if (Buffer.isBuffer(jpegBase64OrBytes)) {
    buf = jpegBase64OrBytes;
  } else {
    const raw = String(jpegBase64OrBytes ?? '');
    const b64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
    buf = Buffer.from(b64, 'base64');
  }
  if (!buf.length) throw new Error('Empty cover image');

  // Ensure JPEG output (accept PNG/WebP via nativeImage).
  const img = nativeImage.createFromBuffer(buf);
  if (img.isEmpty()) {
    throw new Error('Could not decode cover image');
  }
  const jpeg = img.toJPEG(90);
  const dest = getCoverPath(songId);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, jpeg);
  return dest;
}

/** Read cover bytes for packing into a .tune archive, or null if missing. */
export function readCoverBytes(songId: string): Buffer | null {
  const file = getCoverPath(songId);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}
