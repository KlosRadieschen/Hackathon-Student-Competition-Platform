// UC1 business rules for project submission/update and artifact access.
import fs from 'node:fs';
import path from 'node:path';
import { MAX_ARTIFACT_BYTES, UPLOAD_DIR } from '../config.mjs';
import { scanArtifact } from '../security/uploadScanner.mjs';

// The stored content type comes from the validated extension, never from the browser-supplied type.
const mimeByExt = { '.pdf': 'application/pdf', '.zip': 'application/zip', '.txt': 'text/plain', '.md': 'text/markdown' };

// Accept only absolute http(s) URLs with no quotes, angle brackets, or whitespace.
function isValidRepositoryLink(value) {
  if (/["'<>\s`]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitize(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function createSubmissionService(challenges, teams, registrations, submissions, audit) {
  function store(userId, registrationId, payload) {
    const registration = registrations.findById(registrationId);
    if (!registration) throw Object.assign(new Error('Registration not found'), { status: 404, code: 'REGISTRATION_NOT_FOUND' });
    const team = teams.findForUser(userId);
    if (!team || Number(registration.team_id) !== Number(team.id)) {
      throw Object.assign(new Error('You cannot submit for this registration'), { status: 403, code: 'FORBIDDEN' });
    }
    const challenge = challenges.findById(registration.challenge_id);
    if (!challenge || challenge.status !== 'open' || Date.now() > Date.parse(challenge.submission_deadline)) {
      // UC1 extension 3a: tell the team when the deadline was.
      const closedAt = challenge ? new Date(challenge.submission_deadline).toUTCString() : 'unknown';
      throw Object.assign(new Error(`The submission deadline has passed (${closedAt})`), { status: 409, code: 'SUBMISSION_CLOSED' });
    }
    const repositoryLink = String(payload.repositoryLink || '').trim();
    if (repositoryLink && !isValidRepositoryLink(repositoryLink)) {
      throw Object.assign(new Error('Repository link must be a valid http:// or https:// URL'), { status: 400, code: 'INVALID_REPOSITORY_LINK' });
    }
    const previous = submissions.findByRegistration(registrationId);
    const artifact = payload.artifact;
    const hasNewArtifact = Boolean(artifact?.name && artifact?.dataBase64);
    // UC1 required fields: a short description plus a repository link or a project file.
    const description = String(payload.description || '').trim();
    if (description.length < 3) {
      throw Object.assign(new Error('Add a short project description'), { status: 400, code: 'SUBMISSION_DESCRIPTION_REQUIRED' });
    }
    if (!repositoryLink && !hasNewArtifact && !previous?.artifact_path) {
      throw Object.assign(new Error('Provide a repository link or upload a project file'), { status: 400, code: 'SUBMISSION_CONTENT_REQUIRED' });
    }
    // Preserve the existing artifact when the participant updates only the link/description.
    let artifactName = previous?.artifact_name || null;
    let artifactPath = previous?.artifact_path || null;
    let artifactMime = previous?.artifact_mime || null;
    let scanEngine = null;
    if (hasNewArtifact) {
      const buffer = Buffer.from(String(artifact.dataBase64), 'base64');
      // UC1 extension 3b: every file error names the file that failed.
      const safe = sanitize(String(artifact.name));
      if (buffer.length > MAX_ARTIFACT_BYTES) throw Object.assign(new Error(`${safe} is larger than 1 MB`), { status: 413, code: 'FILE_TOO_LARGE' });
      const ext = path.extname(safe).toLowerCase();
      if (!mimeByExt[ext]) throw Object.assign(new Error(`${safe}: allowed file types are PDF, ZIP, TXT, MD`), { status: 415, code: 'INVALID_FILE_TYPE' });
      try {
        scanEngine = scanArtifact(buffer, ext).engine;
      } catch (error) {
        error.message = `${safe}: ${error.message}`;
        throw error;
      }
      artifactName = safe;
      artifactMime = mimeByExt[ext];
      artifactPath = path.join(UPLOAD_DIR, `${registrationId}-${Date.now()}-${safe}`);
      fs.writeFileSync(artifactPath, buffer);
    }
    // Capture one timestamp and use the same value for persistence and the participant receipt.
    const submittedAt = new Date().toISOString();
    // The previous version (and its artifact file) is kept in submission history rather than deleted.
    const { id, version } = submissions.upsert(registrationId, repositoryLink || null, description, artifactName, artifactPath, artifactMime, submittedAt);
    audit.add(userId, previous ? 'SUBMISSION_UPDATED' : 'SUBMISSION_CREATED', 'submission', id, { registrationId, version, artifactName, repositoryLink: repositoryLink || null, scanEngine });
    return { submissionId: id, status: 'submitted', updated: Boolean(previous), version, submittedAt };
  }

  return {
    submit(userId, registrationId, payload) {
      try {
        return store(userId, registrationId, payload);
      } catch (error) {
        // Log every failed attempt so a platform admin can help a team near the deadline without a developer.
        const artifact = payload?.artifact;
        audit.add(userId, 'UPLOAD_FAILED', 'registration', registrationId, {
          code: error?.code || 'INTERNAL_ERROR',
          message: String(error?.message || error),
          artifactName: artifact?.name || null,
          artifactBytes: artifact?.dataBase64 ? Buffer.byteLength(String(artifact.dataBase64), 'base64') : null
        });
        throw error;
      }
    },
    artifactAccess(user, submissionId, evaluationRepo) {
      const submission = submissions.findById(submissionId);
      if (!submission || !submission.artifact_path) throw Object.assign(new Error('Artifact not found'), { status: 404, code: 'ARTIFACT_NOT_FOUND' });
      if (user.role === 'judge') {
        const assignment = evaluationRepo.assignment(user.id, submissionId);
        if (!assignment) throw Object.assign(new Error('Not assigned to this submission'), { status: 403, code: 'FORBIDDEN' });
        if (!assignment.conflict_checked_at) throw Object.assign(new Error('Complete the conflict-of-interest check before opening project artifacts'), { status: 409, code: 'CONFLICT_CHECK_REQUIRED' });
      }
      if (user.role === 'participant') {
        const team = teams.findForUser(user.id);
        if (!team || Number(team.id) !== Number(submission.team_id)) throw Object.assign(new Error('Forbidden'), { status: 403, code: 'FORBIDDEN' });
      }
      return submission;
    }
  };
}
