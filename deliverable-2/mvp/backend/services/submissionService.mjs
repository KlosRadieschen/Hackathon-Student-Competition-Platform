// UC1 business rules for project submission/update and artifact access.
import fs from 'node:fs';
import path from 'node:path';
import { MAX_ARTIFACT_BYTES, UPLOAD_DIR } from '../config.mjs';

const allowedExt = new Set(['.pdf', '.zip', '.txt', '.md']);

function sanitize(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function createSubmissionService(challenges, teams, registrations, submissions, audit) {
  return {
    submit(userId, registrationId, payload) {
      const registration = registrations.findById(registrationId);
      if (!registration) throw Object.assign(new Error('Registration not found'), { status: 404, code: 'REGISTRATION_NOT_FOUND' });
      const team = teams.findForUser(userId);
      if (!team || Number(registration.team_id) !== Number(team.id)) {
        throw Object.assign(new Error('You cannot submit for this registration'), { status: 403, code: 'FORBIDDEN' });
      }
      const challenge = challenges.findById(registration.challenge_id);
      if (!challenge || challenge.status !== 'open' || Date.now() > Date.parse(challenge.submission_deadline)) {
        throw Object.assign(new Error('Submission deadline has passed'), { status: 409, code: 'SUBMISSION_CLOSED' });
      }
      const repositoryLink = String(payload.repositoryLink || '').trim();
      if (repositoryLink && !/^https?:\/\//i.test(repositoryLink)) {
        throw Object.assign(new Error('Repository link must start with http:// or https://'), { status: 400, code: 'INVALID_REPOSITORY_LINK' });
      }
      const previous = submissions.findByRegistration(registrationId);
      // Preserve the existing artifact when the participant updates only the link/description.
      let artifactName = previous?.artifact_name || null;
      let artifactPath = previous?.artifact_path || null;
      let artifactMime = previous?.artifact_mime || null;
      const artifact = payload.artifact;
      if (artifact?.name && artifact?.dataBase64) {
        const buffer = Buffer.from(String(artifact.dataBase64), 'base64');
        if (buffer.length > MAX_ARTIFACT_BYTES) throw Object.assign(new Error('Artifact is larger than 1 MB'), { status: 413, code: 'FILE_TOO_LARGE' });
        const safe = sanitize(String(artifact.name));
        const ext = path.extname(safe).toLowerCase();
        if (!allowedExt.has(ext)) throw Object.assign(new Error('Allowed artifact types: PDF, ZIP, TXT, MD'), { status: 415, code: 'INVALID_FILE_TYPE' });
        artifactName = safe;
        artifactMime = String(artifact.type || 'application/octet-stream');
        artifactPath = path.join(UPLOAD_DIR, `${registrationId}-${Date.now()}-${safe}`);
        fs.writeFileSync(artifactPath, buffer);
      }
      // Capture one timestamp and use the same value for persistence and the participant receipt.
      const submittedAt = new Date().toISOString();
      const id = submissions.upsert(registrationId, repositoryLink || null, String(payload.description || '').trim(), artifactName, artifactPath, artifactMime, submittedAt);
      // If a new artifact replaced the previous one, remove the old physical file after the database update succeeds.
      if (previous?.artifact_path && artifact?.name && previous.artifact_path !== artifactPath && fs.existsSync(previous.artifact_path)) fs.rmSync(previous.artifact_path);
      audit.add(userId, previous ? 'SUBMISSION_UPDATED' : 'SUBMISSION_CREATED', 'submission', id, { registrationId, artifactName, repositoryLink: repositoryLink || null });
      return { submissionId: id, status: 'submitted', updated: Boolean(previous), submittedAt };
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
