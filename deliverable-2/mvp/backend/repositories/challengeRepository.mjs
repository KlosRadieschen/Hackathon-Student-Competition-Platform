// Persistence boundary for Challenge and EvaluationCriterion data.
// Services use these named operations instead of knowing SQL/table details.
export function createChallengeRepository(db) {
  return {
    // List all challenges in a stable order for participant and organizer screens.
    list() {
      return db.prepare('SELECT * FROM challenges ORDER BY id').all();
    },

    // List only challenges owned by one organizer; admins can still use list().
    listForOrganizer(organizerId) {
      return db.prepare('SELECT * FROM challenges WHERE organizer_id=? ORDER BY id').all(organizerId);
    },

    // Find one challenge by primary key.
    findById(id) {
      return db.prepare('SELECT * FROM challenges WHERE id=?').get(id) || null;
    },

    // Create a new organizer-owned challenge and return its id.
    create(input) {
      const result = db.prepare(`
        INSERT INTO challenges(
          title,description,rules,min_team_size,max_team_size,max_teams,
          registration_deadline,submission_deadline,status,organizer_id,published_at
        ) VALUES(?,?,?,?,?,?,?,?,'open',?,NULL)
      `).run(
        input.title,
        input.description,
        input.rules,
        input.minTeamSize,
        input.maxTeamSize,
        input.maxTeams,
        input.registrationDeadline,
        input.submissionDeadline,
        input.organizerId
      );
      return Number(result.lastInsertRowid);
    },

    // Update editable challenge configuration while preserving status/ownership.
    update(id, input) {
      const result = db.prepare(`
        UPDATE challenges
        SET title=?,description=?,rules=?,min_team_size=?,max_team_size=?,max_teams=?,
            registration_deadline=?,submission_deadline=?
        WHERE id=?
      `).run(
        input.title,
        input.description,
        input.rules,
        input.minTeamSize,
        input.maxTeamSize,
        input.maxTeams,
        input.registrationDeadline,
        input.submissionDeadline,
        id
      );
      return result.changes > 0;
    },

    // Move a challenge into judging and close submissions at the supplied timestamp.
    setJudging(id, deadlineIso) {
      const result = db.prepare(`
        UPDATE challenges
        SET status='judging', submission_deadline=?
        WHERE id=?
      `).run(deadlineIso, id);
      return result.changes > 0;
    },

    // Mark final MVP results as published.
    setPublished(id, publishedAt) {
      const result = db.prepare(`
        UPDATE challenges
        SET status='published', published_at=?
        WHERE id=?
      `).run(publishedAt, id);
      return result.changes > 0;
    },

    // Return the organizer-configured rubric for one challenge.
    criteria(challengeId) {
      return db.prepare(`
        SELECT id,
               challenge_id AS challengeId,
               name,
               description,
               weight,
               max_score AS maxScore
        FROM evaluation_criteria
        WHERE challenge_id=?
        ORDER BY id
      `).all(challengeId);
    },

    // Replace the complete rubric as one transaction so judges never see a half-updated rubric.
    replaceCriteria(challengeId, criteria) {
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM evaluation_criteria WHERE challenge_id=?').run(challengeId);
        const insert = db.prepare(`
          INSERT INTO evaluation_criteria(challenge_id,name,description,weight,max_score)
          VALUES(?,?,?,?,?)
        `);
        for (const criterion of criteria) {
          insert.run(challengeId, criterion.name, criterion.description, criterion.weight, criterion.maxScore);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    // List the teams registered for a challenge with their current size and submission state (UC2 step 5).
    registrationList(challengeId) {
      return db.prepare(`
        SELECT r.id AS registrationId,
               t.name AS teamName,
               (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id=t.id) AS size,
               r.registered_at AS registeredAt,
               s.submitted_at AS submittedAt,
               s.version AS submissionVersion
        FROM registrations r
        JOIN teams t ON t.id=r.team_id
        LEFT JOIN submissions s ON s.registration_id=r.id
        WHERE r.challenge_id=?
        ORDER BY r.id
      `).all(challengeId).map((row) => ({ ...row, size: Number(row.size) }));
    },

    // Count registered teams so challenge capacity can be enforced.
    registrationCount(challengeId) {
      return Number(db.prepare('SELECT COUNT(*) AS n FROM registrations WHERE challenge_id=?').get(challengeId).n);
    },

    // Count stored evaluations for a challenge so rubric editing cannot invalidate completed judging.
    evaluationCount(challengeId) {
      return Number(db.prepare(`
        SELECT COUNT(*) AS n
        FROM evaluations e
        JOIN submissions s ON s.id=e.submission_id
        JOIN registrations r ON r.id=s.registration_id
        WHERE r.challenge_id=?
      `).get(challengeId).n);
    }
  };
}
