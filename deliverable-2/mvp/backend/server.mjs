// Composition root and HTTP server that wires controllers, services, repositories, and storage.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { HOST, PORT, PUBLIC_DIR, BACKUP_DIR, BACKUP_KEEP, BACKUP_INTERVAL_MS, UPLOAD_DIR } from './config.mjs';
import { openDatabase } from './storage/database.mjs';
import { seedDatabase } from './storage/seed.mjs';
import { Router } from './http/router.mjs';
import { SECURITY_HEADERS, sendError, sendJson } from './http/response.mjs';
import { registerApiRoutes } from './controllers/apiController.mjs';
import { createUserRepository } from './repositories/userRepository.mjs';
import { createChallengeRepository } from './repositories/challengeRepository.mjs';
import { createTeamRepository } from './repositories/teamRepository.mjs';
import { createRegistrationRepository } from './repositories/registrationRepository.mjs';
import { createSubmissionRepository } from './repositories/submissionRepository.mjs';
import { createEvaluationRepository } from './repositories/evaluationRepository.mjs';
import { createAuditRepository } from './repositories/auditRepository.mjs';
import { createResultRepository } from './repositories/resultRepository.mjs';
import { createAuthService } from './services/authService.mjs';
import { createTeamService } from './services/teamService.mjs';
import { createRegistrationService } from './services/registrationService.mjs';
import { createSubmissionService } from './services/submissionService.mjs';
import { createOrganizerService } from './services/organizerService.mjs';
import { createEvaluationService } from './services/evaluationService.mjs';
import { createResultService } from './services/resultService.mjs';
import { createBackupService } from './services/backupService.mjs';
import { createAdminService } from './services/adminService.mjs';

const db = openDatabase();
seedDatabase(db);
const users = createUserRepository(db);
const challenges = createChallengeRepository(db);
const teams = createTeamRepository(db);
const registrations = createRegistrationRepository(db);
const submissions = createSubmissionRepository(db);
const evaluationRepo = createEvaluationRepository(db);
const audit = createAuditRepository(db);
const results = createResultRepository(db);
const backups = createBackupService(db, audit, { backupDir: BACKUP_DIR, uploadDir: UPLOAD_DIR, keep: BACKUP_KEEP });
const deps = {
  users, challenges, teams, registrations, submissions, evaluationRepo, results, audit,
  authService: createAuthService(users, audit),
  teamService: createTeamService(teams, audit, registrations, challenges),
  registrationService: createRegistrationService(challenges, teams, registrations, audit, submissions),
  submissionService: createSubmissionService(challenges, teams, registrations, submissions, audit),
  organizerService: createOrganizerService(challenges, submissions, users, evaluationRepo, results, audit),
  evaluationService: createEvaluationService(challenges, submissions, evaluationRepo, audit),
  resultService: createResultService(challenges, teams, results),
  adminService: createAdminService(users, teams, audit, backups)
};
backups.startSchedule(BACKUP_INTERVAL_MS);

const router = new Router();
registerApiRoutes(router, deps);

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const full = path.resolve(PUBLIC_DIR, rel);
  if (!full.startsWith(path.resolve(PUBLIC_DIR))) return false;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return false;
  const data = fs.readFileSync(full);
  res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': mime[path.extname(full)] || 'application/octet-stream', 'content-length': data.length });
  res.end(data);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health') return sendJson(res, 200, { status: 'ok' });
    if (url.pathname.startsWith('/api/')) {
      const matched = await router.handle(req, res, url);
      if (!matched) sendJson(res, 404, { error: 'NOT_FOUND', message: 'API route not found' });
      return;
    }
    if (!serveStatic(res, url.pathname)) {
      if (!serveStatic(res, '/index.html')) sendJson(res, 404, { error: 'NOT_FOUND', message: 'Not found' });
    }
  } catch (error) {
    // Expected 4xx business-rule failures are returned to the client without noisy stack traces.
    if (!error?.status || Number(error.status) >= 500) console.error(error);
    if (!res.headersSent) sendError(res, error);
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Hackathon Platform MVP running at http://${HOST}:${PORT}`);
});
