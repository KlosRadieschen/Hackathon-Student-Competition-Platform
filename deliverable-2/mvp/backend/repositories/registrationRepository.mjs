// Persistence operations for challenge registrations and participant registration views.
export function createRegistrationRepository(db) {
  return {
    findByTeamAndChallenge(teamId, challengeId) {
      return db.prepare(`SELECT * FROM registrations WHERE team_id=? AND challenge_id=?`).get(teamId, challengeId) || null;
    },
    findByTeam(teamId) {
      return db.prepare(`SELECT * FROM registrations WHERE team_id=? ORDER BY id LIMIT 1`).get(teamId) || null;
    },
    create(teamId, challengeId, registeredAt) {
      const r = db.prepare(`INSERT INTO registrations(team_id,challenge_id,registered_at,status) VALUES(?,?,?,'registered')`).run(teamId, challengeId, registeredAt);
      return Number(r.lastInsertRowid);
    },
    listForTeam(teamId) {
      return db.prepare(`
        SELECT r.id,r.team_id AS teamId,r.challenge_id AS challengeId,r.registered_at AS registeredAt,r.status,
               c.title,c.submission_deadline AS submissionDeadline,c.status AS challengeStatus,
               s.id AS submissionId,s.version AS submissionVersion,s.repository_link AS repositoryLink,s.description AS submissionDescription,s.artifact_name AS artifactName,s.submitted_at AS submittedAt
        FROM registrations r
        JOIN challenges c ON c.id=r.challenge_id
        LEFT JOIN submissions s ON s.registration_id=r.id
        WHERE r.team_id=? ORDER BY r.id
      `).all(teamId);
    },
    findById(id) {
      return db.prepare(`SELECT * FROM registrations WHERE id=?`).get(id) || null;
    }
  };
}
