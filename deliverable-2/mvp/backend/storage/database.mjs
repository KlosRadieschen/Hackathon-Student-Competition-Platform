// Import Node's file-system helpers so we can create the data/upload folders.
import fs from 'node:fs';
// Import path helpers so database paths work consistently on macOS, Linux, and Windows.
import path from 'node:path';
// Use Node's built-in synchronous SQLite driver; this keeps the MVP dependency-light.
import { DatabaseSync } from 'node:sqlite';
// Import the configured database and upload locations.
import { DB_PATH, UPLOAD_DIR } from '../config.mjs';

// Open the application database and create the schema if it does not exist yet.
export function openDatabase(dbPath = DB_PATH) {
  // Ensure the database directory exists before SQLite tries to create the file.
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  // Ensure the upload directory also exists before any submission artifact is saved.
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // Open SQLite. Passing ':memory:' from tests creates an isolated test database.
  const db = new DatabaseSync(dbPath);
  // Enforce foreign-key constraints so invalid cross-table references are rejected.
  db.exec('PRAGMA foreign_keys = ON;');
  // NFR2: write-ahead logging cuts the per-commit disk wait to roughly a third under deadline load.
  // synchronous=FULL keeps every committed submission on disk even after a power cut (NFR3 receipts).
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');

  // Create every table needed by the D2 MVP.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('participant','organizer','judge','admin'))
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      rules TEXT NOT NULL DEFAULT '',
      min_team_size INTEGER NOT NULL,
      max_team_size INTEGER NOT NULL,
      max_teams INTEGER,
      registration_deadline TEXT NOT NULL,
      submission_deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      organizer_id INTEGER REFERENCES users(id),
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      owner_user_id INTEGER NOT NULL REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      challenge_id INTEGER NOT NULL REFERENCES challenges(id),
      registered_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'registered',
      UNIQUE(team_id, challenge_id)
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL UNIQUE REFERENCES registrations(id),
      repository_link TEXT,
      description TEXT NOT NULL DEFAULT '',
      artifact_name TEXT,
      artifact_path TEXT,
      artifact_mime TEXT,
      submitted_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      version INTEGER NOT NULL DEFAULT 1
    );

    -- UC1 extension 4a: every replaced submission is kept here as history.
    CREATE TABLE IF NOT EXISTS submission_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL REFERENCES submissions(id),
      version INTEGER NOT NULL,
      repository_link TEXT,
      description TEXT NOT NULL DEFAULT '',
      artifact_name TEXT,
      artifact_path TEXT,
      artifact_mime TEXT,
      submitted_at TEXT NOT NULL,
      replaced_at TEXT NOT NULL,
      UNIQUE(submission_id, version)
    );

    CREATE TABLE IF NOT EXISTS judge_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      judge_id INTEGER NOT NULL REFERENCES users(id),
      submission_id INTEGER NOT NULL REFERENCES submissions(id),
      status TEXT NOT NULL DEFAULT 'active',
      assigned_at TEXT NOT NULL,
      conflict_checked_at TEXT,
      UNIQUE(judge_id, submission_id)
    );

    CREATE TABLE IF NOT EXISTS evaluation_criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      weight REAL NOT NULL,
      max_score REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      judge_id INTEGER NOT NULL REFERENCES users(id),
      submission_id INTEGER NOT NULL REFERENCES submissions(id),
      reason TEXT NOT NULL,
      declared_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'declared',
      UNIQUE(judge_id, submission_id)
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      judge_id INTEGER NOT NULL REFERENCES users(id),
      submission_id INTEGER NOT NULL REFERENCES submissions(id),
      total_score REAL NOT NULL,
      feedback TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      UNIQUE(judge_id, submission_id)
    );

    CREATE TABLE IF NOT EXISTS criterion_scores (
      evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
      criterion_id INTEGER NOT NULL REFERENCES evaluation_criteria(id),
      score REAL NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(evaluation_id, criterion_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `);

  // Support users who already ran an older MVP database before conflict_checked_at existed.
  const assignmentColumns = db.prepare('PRAGMA table_info(judge_assignments)').all();
  // Add the migration column only when it is absent; a clean database already has it.
  if (!assignmentColumns.some((column) => column.name === 'conflict_checked_at')) {
    db.exec('ALTER TABLE judge_assignments ADD COLUMN conflict_checked_at TEXT;');
  }


  // Support older local MVP databases that were created before challenge-management fields existed.
  const challengeColumns = db.prepare('PRAGMA table_info(challenges)').all();
  if (!challengeColumns.some((column) => column.name === 'rules')) {
    db.exec("ALTER TABLE challenges ADD COLUMN rules TEXT NOT NULL DEFAULT ''; ");
  }
  if (!challengeColumns.some((column) => column.name === 'organizer_id')) {
    db.exec('ALTER TABLE challenges ADD COLUMN organizer_id INTEGER REFERENCES users(id);');
  }
  if (!challengeColumns.some((column) => column.name === 'published_at')) {
    db.exec('ALTER TABLE challenges ADD COLUMN published_at TEXT;');
  }
  if (!challengeColumns.some((column) => column.name === 'max_teams')) {
    db.exec('ALTER TABLE challenges ADD COLUMN max_teams INTEGER;');
  }

  // Support older local databases created before submission version history existed.
  const submissionColumns = db.prepare('PRAGMA table_info(submissions)').all();
  if (!submissionColumns.some((column) => column.name === 'version')) {
    db.exec('ALTER TABLE submissions ADD COLUMN version INTEGER NOT NULL DEFAULT 1;');
  }

  // Return the open database to repositories and services.
  return db;
}

// Close a database cleanly when tests or the application are finished with it.
export function closeDatabase(db) {
  // Node's SQLite handle owns the file descriptor, so closing it releases the resource.
  db.close();
}
