// Content checks run on every uploaded artifact before it is stored (NFR1 "uploaded files scanned").
// Built-in checks always run; ClamAV is used in addition when it is installed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CLAMSCAN_PATH } from '../config.mjs';

// The EICAR string is the standard harmless antivirus test file. It is split here so this source file is not flagged itself.
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');

// Binary formats must start with their file signature; anything else (e.g. a renamed .exe) is rejected.
const MAGIC = {
  '.pdf': [Buffer.from('%PDF-')],
  '.zip': [Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from([0x50, 0x4b, 0x05, 0x06])]
};

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

// Text formats must be valid UTF-8 without NUL bytes, which rules out executables and other binaries.
function looksLikeText(buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

// Find a ClamAV command once: undefined = not looked up yet, null = not installed.
let clamCommand;
function findClamAv() {
  if (clamCommand !== undefined) return clamCommand;
  const candidates = CLAMSCAN_PATH ? [CLAMSCAN_PATH] : ['clamdscan', 'clamscan'];
  clamCommand = candidates.find((command) => !spawnSync(command, ['--version']).error) || null;
  return clamCommand;
}

// Throw a coded error when the file is unsafe; otherwise return which engine checked it.
export function scanArtifact(buffer, ext) {
  if (buffer.includes(EICAR)) {
    throw fail(422, 'MALWARE_DETECTED', 'The file was rejected by the malware scan');
  }

  const signatures = MAGIC[ext];
  const contentMatches = signatures
    ? signatures.some((signature) => buffer.subarray(0, signature.length).equals(signature))
    : looksLikeText(buffer);
  if (!contentMatches) {
    throw fail(415, 'FILE_CONTENT_MISMATCH', `The file content does not match its ${ext} extension`);
  }

  const command = findClamAv();
  if (!command) return { engine: 'built-in' };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hackathon-scan-'));
  const file = path.join(dir, `artifact${ext}`);
  try {
    fs.writeFileSync(file, buffer);
    // clamdscan runs as another user, so pass the open file descriptor instead of a path it cannot read.
    const args = path.basename(command).startsWith('clamdscan') ? ['--no-summary', '--fdpass', file] : ['--no-summary', file];
    const result = spawnSync(command, args, { timeout: 60000 });
    if (result.status === 1) throw fail(422, 'MALWARE_DETECTED', 'The file was rejected by the malware scan');
    if (result.status !== 0) throw fail(503, 'SCAN_UNAVAILABLE', 'The malware scanner could not check the file');
    return { engine: `built-in+${path.basename(command)}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
