// Central configuration values and filesystem locations for the MVP.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT_DIR, 'uploads');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'frontend', 'public');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'hackathon.db');
export const PORT = Number(process.env.PORT || 3000);
// Listen on localhost by default; HOST=0.0.0.0 makes the MVP reachable from a phone on the same network.
export const HOST = process.env.HOST || '127.0.0.1';
export const TOKEN_SECRET = process.env.TOKEN_SECRET || 'development-only-change-me';
export const MAX_ARTIFACT_BYTES = 1024 * 1024;
export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(ROOT_DIR, 'backups');
export const BACKUP_KEEP = Number(process.env.BACKUP_KEEP || 14);
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Optional ClamAV command (clamdscan or clamscan); when unset the scanner looks for one on PATH.
export const CLAMSCAN_PATH = process.env.CLAMSCAN_PATH || '';
