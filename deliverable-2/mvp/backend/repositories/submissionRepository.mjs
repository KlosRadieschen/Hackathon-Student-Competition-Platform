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
    upsert(registrationId, repositoryLink, description, artifactName, artifactPath, artifactMime, submittedAt) {
      const existing = db.prepare(`SELECT id FROM submissions WHERE registration_id=?`).get(registrationId);
      if (existing) {
        db.prepare(`
          UPDATE submissions SET repository_link=?,description=?,artifact_name=?,artifact_path=?,artifact_mime=?,submitted_at=?,status='submitted'
          WHERE registration_id=?
        `).run(repositoryLink, description, artifactName, artifactPath, artifactMime, submittedAt, registrationId);
        return Number(existing.id);
      }
      const r = db.prepare(`
        INSERT INTO submissions(registration_id,repository_link,description,artifact_name,artifact_path,artifact_mime,submitted_at,status)
        VALUES(?,?,?,?,?,?,?,'submitted')
      `).run(registrationId, repositoryLink, description, artifactName, artifactPath, artifactMime, submittedAt);
      return Number(r.lastInsertRowid);
    },
    listForOrganizer() {
      return db.prepare(`
        SELECT s.id AS submissionId,s.repository_link AS repositoryLink,s.artifact_name AS artifactName,s.submitted_at AS submittedAt,
               t.name AS teamName,c.id AS challengeId,c.title AS challengeTitle,c.status AS challengeStatus,
               GROUP_CONCAT(CASE WHEN ja.status='active' THEN u.email END) AS assignedJudges
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
