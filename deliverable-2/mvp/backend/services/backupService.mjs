// Automated daily and manual backups of the SQLite database and uploaded submission artifacts (NFR3, admin story 3).
import fs from 'node:fs';
import path from 'node:path';

export function createBackupService(db, audit, { backupDir, uploadDir, keep = 14 }) {
  // List backups newest first, using the manifest written into each backup folder.
  function list() {
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir)
      .map((name) => path.join(backupDir, name, 'manifest.json'))
      .filter((file) => fs.existsSync(file))
      .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // Copy the database and every artifact into a new timestamped folder.
  function create(reason, userId = null) {
    const createdAt = new Date().toISOString();
    const name = `backup-${createdAt.replace(/[:.]/g, '-')}`;
    const dir = path.join(backupDir, name);
    fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });

    // VACUUM INTO writes a consistent copy of the live database without stopping the server.
    db.exec(`VACUUM INTO '${path.join(dir, 'hackathon.db').replace(/'/g, "''")}'`);

    let artifactCount = 0;
    if (fs.existsSync(uploadDir)) {
      for (const file of fs.readdirSync(uploadDir)) {
        if (file.startsWith('.')) continue;
        fs.copyFileSync(path.join(uploadDir, file), path.join(dir, 'uploads', file));
        artifactCount += 1;
      }
    }

    const manifest = { name, createdAt, reason, artifactCount };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // Keep only the newest backups so long-running events do not fill the disk.
    for (const old of list().slice(keep)) {
      fs.rmSync(path.join(backupDir, old.name), { recursive: true, force: true });
    }

    audit.add(userId, 'BACKUP_CREATED', 'backup', name, { reason, artifactCount });
    return manifest;
  }

  // Back up at startup when the newest backup is older than the interval, then repeat on the interval.
  function startSchedule(intervalMs) {
    const run = () => {
      try { create('scheduled'); }
      catch (error) { console.error('Scheduled backup failed', error); }
    };
    const latest = list()[0];
    if (!latest || Date.now() - Date.parse(latest.createdAt) >= intervalMs) run();
    const timer = setInterval(run, intervalMs);
    timer.unref();
    return timer;
  }

  return { list, create, startSchedule };
}
