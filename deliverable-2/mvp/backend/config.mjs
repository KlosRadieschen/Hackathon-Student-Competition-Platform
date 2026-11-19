// Central configuration values and filesystem locations for the MVP.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'frontend', 'public');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'hackathon.db');
export const PORT = Number(process.env.PORT || 3000);
export const TOKEN_SECRET = process.env.TOKEN_SECRET || 'development-only-change-me';
export const MAX_ARTIFACT_BYTES = 1024 * 1024;
