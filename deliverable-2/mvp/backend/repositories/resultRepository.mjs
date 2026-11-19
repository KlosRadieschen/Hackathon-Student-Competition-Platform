// Persistence operations used to build and publish provisional MVP results.
// The final ranking formula was an open question in D1, so this repository only
// implements the clearly-labelled D2 MVP choice: average judge weighted totals.
export function createResultRepository(db) {
  return {
    // Count submitted projects for one challenge.
    submissionCount(challengeId) {
      return Number(db.prepare(`
        SELECT COUNT(*) AS n
        FROM submissions s
        JOIN registrations r ON r.id=s.registration_id
        WHERE r.challenge_id=?
      `).get(challengeId).n);
    },

    // Count how many distinct submitted projects already have at least one evaluation.
    evaluatedSubmissionCount(challengeId) {
      return Number(db.prepare(`
        SELECT COUNT(DISTINCT s.id) AS n
        FROM submissions s
        JOIN registrations r ON r.id=s.registration_id
        JOIN evaluations e ON e.submission_id=s.id
        WHERE r.challenge_id=?
      `).get(challengeId).n);
    },

    // Build a provisional ranking from the average of judge weighted totals.
    ranking(challengeId) {
      return db.prepare(`
        WITH scores AS (
          SELECT t.id AS teamId,
                 t.name AS teamName,
                 s.id AS submissionId,
                 ROUND(AVG(e.total_score),2) AS provisionalScore,
                 COUNT(e.id) AS evaluationCount
          FROM registrations r
          JOIN teams t ON t.id=r.team_id
          JOIN submissions s ON s.registration_id=r.id
          JOIN evaluations e ON e.submission_id=s.id
          WHERE r.challenge_id=?
          GROUP BY t.id,t.name,s.id
        )
        SELECT RANK() OVER (ORDER BY provisionalScore DESC, teamName ASC) AS position,
               teamId,teamName,submissionId,provisionalScore,evaluationCount
        FROM scores
        ORDER BY position,teamName
      `).all(challengeId);
    },

    // Return all written feedback for one team's submitted project without judge names.
    feedbackForTeam(teamId, challengeId) {
      return db.prepare(`
        SELECT e.feedback,e.submitted_at AS submittedAt
        FROM evaluations e
        JOIN submissions s ON s.id=e.submission_id
        JOIN registrations r ON r.id=s.registration_id
        WHERE r.team_id=? AND r.challenge_id=?
        ORDER BY e.id
      `).all(teamId, challengeId);
    }
  };
}
