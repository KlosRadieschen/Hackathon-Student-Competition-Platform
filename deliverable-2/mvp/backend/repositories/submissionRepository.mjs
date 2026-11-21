// Persistence operations for the single active MVP submission per registration.
export function createSubmissionRepository(db) {
  return {
    findByRegistration(registrationId) {
      return db.prepare(`SELECT * FROM submissions WHERE registration_id=?`).get(registrationId) || null;
    },
    findById(id) {
      return db.prepare(`
        SELECT s.*,r.team_id,r.challenge_id,c.title AS challenge_title,c.submission_deadline,c.status AS challenge_status,t.name AS team_name
        FROM submissions s
        JOIN registrations r ON r.id=s.registration_id
        JOIN challenges c ON c.id=r.challenge_id
        JOIN teams t ON t.id=r.team_id
        WHERE s.id=?
      `).get(id) || null;
    },
    // Create the active submission, or archive the current one into history and replace it (UC1 extension 4a).
    upsert(registrationId, repositoryLink, description, artifactName, artifactPath, artifactMime, submittedAt) {
      db.exec('BEGIN');
      try {
        const existing = db.prepare(`SELECT * FROM submissions WHERE registration_id=?`).get(registrationId);
        let result;
        if (existing) {
          db.prepare(`
            INSERT INTO submission_versions(submission_id,version,repository_link,description,artifact_name,artifact_path,artifact_mime,submitted_at,replaced_at)
            VALUES(?,?,?,?,?,?,?,?,?)
          `).run(existing.id, existing.version, existing.repository_link, existing.description, existing.artifact_name, existing.artifact_path, existing.artifact_mime, existing.submitted_at, submittedAt);
          db.prepare(`
            UPDATE submissions SET repository_link=?,description=?,artifact_name=?,artifact_path=?,artifact_mime=?,submitted_at=?,status='submitted',version=version+1
            WHERE registration_id=?
          `).run(repositoryLink, description, artifactName, artifactPath, artifactMime, submittedAt, registrationId);
          result = { id: Number(existing.id), version: Number(existing.version) + 1 };
        } else {
          const r = db.prepare(`
            INSERT INTO submissions(registration_id,repository_link,description,artifact_name,artifact_path,artifact_mime,submitted_at,status,version)
            VALUES(?,?,?,?,?,?,?,'submitted',1)
          `).run(registrationId, repositoryLink, description, artifactName, artifactPath, artifactMime, submittedAt);
          result = { id: Number(r.lastInsertRowid), version: 1 };
        }
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    // Previous versions of one submission, newest first.
    listVersions(submissionId) {
      return db.prepare(`
        SELECT version,repository_link AS repositoryLink,description,artifact_name AS artifactName,submitted_at AS submittedAt,replaced_at AS replacedAt
        FROM submission_versions WHERE submission_id=? ORDER BY version DESC
      `).all(submissionId);
    },
    listForOrganizer() {
      return db.prepare(`
        SELECT s.id AS submissionId,s.repository_link AS repositoryLink,s.artifact_name AS artifactName,s.submitted_at AS submittedAt,
               s.version,t.name AS teamName,c.id AS challengeId,c.title AS challengeTitle,c.status AS challengeStatus,
               GROUP_CONCAT(CASE WHEN ja.status='active' THEN u.email END) AS assignedJudges,
               (SELECT GROUP_CONCAT(cu.email) FROM conflicts cf JOIN users cu ON cu.id=cf.judge_id WHERE cf.submission_id=s.id) AS conflictJudges,
               -- UC3 extension 2a: a conflict was declared and no judge is currently assigned.
               CASE WHEN EXISTS(SELECT 1 FROM conflicts cf WHERE cf.submission_id=s.id)
                     AND NOT EXISTS(SELECT 1 FROM judge_assignments a WHERE a.submission_id=s.id AND a.status='active')
                    THEN 1 ELSE 0 END AS needsReassignment
        FROM submissions s
        JOIN registrations r ON r.id=s.registration_id
        JOIN teams t ON t.id=r.team_id
        JOIN challenges c ON c.id=r.challenge_id
        LEFT JOIN judge_assignments ja ON ja.submission_id=s.id
        LEFT JOIN users u ON u.id=ja.judge_id
        GROUP BY s.id ORDER BY s.id
      `).all();
    }
  };
}
