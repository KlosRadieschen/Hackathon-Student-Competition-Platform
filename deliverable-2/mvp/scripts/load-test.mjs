// NFR2 load test: simulates the submission-deadline spike.
// It starts its own server on a temporary database/upload/backup folder, so real data is never touched.
//
// Scenarios:
//   1. Deadline rush (the NFR2 target): every team submits at a random moment in the final RUSH_SECONDS,
//      while also refreshing its dashboard. Target: no failures and p95 <= 2000 ms.
//   2. Worst-case burst (stress): every team re-submits in the same instant. Target: no failures
//      (no lost submissions); latency is reported for information.
//
// Usage: npm run load-test -- [teams] [artifactKB] [rushSeconds]
//   teams        number of teams (default 200)
//   artifactKB   size of each uploaded file in KB (default 200)
//   rushSeconds  length of the deadline rush window (default 10)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEAMS = Number(process.argv[2] || 200);
const ARTIFACT_KB = Number(process.argv[3] || 200);
const RUSH_SECONDS = Number(process.argv[4] || 10);
const P95_TARGET_MS = 2000;
const PORT = 3190;
const BASE = `http://127.0.0.1:${PORT}/api`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hackathon-load-'));

const server = spawn(process.execPath, ['--no-warnings', 'backend/server.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_PATH: path.join(tmp, 'load.db'),
    UPLOAD_DIR: path.join(tmp, 'uploads'),
    BACKUP_DIR: path.join(tmp, 'backups')
  },
  stdio: ['ignore', 'ignore', 'inherit']
});

async function call(method, route, token, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${json.error}`);
  return json;
}

// Time one request; failures are counted rather than aborting the run.
async function timed(fn) {
  const start = performance.now();
  try {
    await fn();
    return { ms: performance.now() - start, ok: true };
  } catch (error) {
    return { ms: performance.now() - start, ok: false, error: error.message };
  }
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function summarize(name, results, wallMs) {
  const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
  const failed = results.filter((r) => !r.ok);
  const row = {
    name,
    requests: results.length,
    failed: failed.length,
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    max: Math.round(sorted[sorted.length - 1]),
    perSecond: Math.round(results.length / (wallMs / 1000))
  };
  if (failed.length) console.log(`  first failure: ${failed[0].error}`);
  return row;
}

async function main() {
  // Wait for the server to come up.
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${BASE}/health`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }

  // Setup (not measured): a dedicated challenge and one registered single-member team per simulated team.
  const organizer = (await call('POST', '/auth/login', null, { email: 'organizer@example.com', password: 'Pass123!' })).token;
  const day = 24 * 60 * 60 * 1000;
  const { challengeId } = await call('POST', '/organizer/challenges', organizer, {
    title: 'Load test challenge',
    description: 'Synthetic challenge for the NFR2 load test.',
    rules: 'Submit before the deadline.',
    minTeamSize: 1,
    maxTeamSize: 4,
    registrationDeadline: new Date(Date.now() + day).toISOString(),
    submissionDeadline: new Date(Date.now() + 2 * day).toISOString()
  });

  console.log(`Setting up ${TEAMS} teams...`);
  const teams = [];
  for (let i = 0; i < TEAMS; i++) {
    const { token } = await call('POST', '/auth/register', null, { name: `Load ${i}`, email: `load${i}@example.com`, password: 'LoadTest123' });
    await call('POST', '/teams', token, { name: `Load team ${i}` });
    const { registrationId } = await call('POST', `/challenges/${challengeId}/register`, token);
    teams.push({ token, registrationId });
  }

  const artifact = Buffer.alloc(ARTIFACT_KB * 1024, 'a').toString('base64');
  const submit = (team, i) => call('POST', `/registrations/${team.registrationId}/submission`, team.token, {
    repositoryLink: `https://github.com/example/load-${i}`,
    description: `Load test submission ${i}`,
    artifact: { name: `project-${i}.txt`, dataBase64: artifact }
  });

  // Run fn at a random moment within the rush window.
  const sometimeInRush = (fn) => new Promise((resolve) => setTimeout(() => resolve(timed(fn)), Math.random() * RUSH_SECONDS * 1000));

  // Scenario 1: deadline rush.
  console.log(`Deadline rush: ${TEAMS} submissions (${ARTIFACT_KB} KB each) + ${TEAMS} dashboard refreshes in ${RUSH_SECONDS} s...`);
  let start = performance.now();
  const [submissions, refreshes] = await Promise.all([
    Promise.all(teams.map((team, i) => sometimeInRush(() => submit(team, i)))),
    Promise.all(teams.map((team) => sometimeInRush(() => call('GET', '/registrations/me', team.token))))
  ]);
  const rushWall = performance.now() - start;

  // Scenario 2: worst-case burst, every team replaces its submission in the same instant (exercises version history).
  console.log(`Worst-case burst: ${TEAMS} simultaneous re-submissions...`);
  start = performance.now();
  const burst = await Promise.all(teams.map((team, i) => timed(() => submit(team, i))));
  const burstWall = performance.now() - start;

  const rush = [summarize('rush: submit', submissions, rushWall), summarize('rush: dashboard refresh', refreshes, rushWall)];
  const stress = summarize('burst: simultaneous re-submit', burst, burstWall);
  console.log('\nResults (milliseconds):');
  console.table([...rush, stress]);

  const rushPassed = rush.every((row) => row.failed === 0 && row.p95 <= P95_TARGET_MS);
  const burstPassed = stress.failed === 0;
  console.log(`\nDeadline rush: no failed requests and p95 <= ${P95_TARGET_MS} ms -> ${rushPassed ? 'PASS' : 'FAIL'}`);
  console.log(`Worst-case burst: no failed (lost) submissions -> ${burstPassed ? 'PASS' : 'FAIL'}`);
  return rushPassed && burstPassed;
}

main()
  .then((passed) => { process.exitCode = passed ? 0 : 1; })
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
