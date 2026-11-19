// Create the persistence boundary for judge assignments, conflicts, and evaluations.
export function createEvaluationRepository(db) {
  // Expose focused operations instead of exposing SQLite directly to services.
  return {
    // Create or reactivate an assignment when an organizer assigns a judge.
    assignJudge(judgeId, submissionId, assignedAt) {
      db.prepare(`
        INSERT INTO judge_assignments(judge_id,submission_id,status,assigned_at,conflict_checked_at)
        VALUES(?,?,'active',?,NULL)
        ON CONFLICT(judge_id,submission_id)
        DO UPDATE SET status='active', assigned_at=excluded.assigned_at, conflict_checked_at=NULL
      `).run(judgeId, submissionId, assignedAt);
    },

    // Return an active assignment; conflict assignments intentionally no longer count as active.
    assignment(judgeId, submissionId) {
      return db.prepare(`
        SELECT *
        FROM judge_assignments
        WHERE judge_id=? AND submission_id=? AND status='active'
      `).get(judgeId, submissionId) || null;
    },

    // List only the identity information needed to decide conflict of interest.
    // Project repository links, descriptions, and artifacts are deliberately NOT returned here.
    listAssignments(judgeId) {
      return db.prepare(`
        SELECT ja.id AS assignmentId,
               ja.submission_id AS submissionId,
               ja.status,
               CASE WHEN ja.conflict_checked_at IS NULL THEN 0 ELSE 1 END AS conflictChecked,
               t.name AS teamName,
               c.title AS challengeTitle,
               c.status AS challengeStatus,
               CASE WHEN e.id IS NULL THEN 0 ELSE 1 END AS hasEvaluation
        FROM judge_assignments ja
        JOIN submissions s ON s.id=ja.submission_id
        JOIN registrations r ON r.id=s.registration_id
        JOIN teams t ON t.id=r.team_id
        JOIN challenges c ON c.id=r.challenge_id
        LEFT JOIN evaluations e ON e.judge_id=ja.judge_id AND e.submission_id=ja.submission_id
        WHERE ja.judge_id=? AND ja.status='active'
        ORDER BY ja.id
      `).all(judgeId);
    },

    // Record the judge's explicit confirmation that no conflict exists before project content is opened.
    markNoConflict(judgeId, submissionId, checkedAt) {
      const result = db.prepare(`
        UPDATE judge_assignments
        SET conflict_checked_at=?
        WHERE judge_id=? AND submission_id=? AND status='active'
      `).run(checkedAt, judgeId, submissionId);
      return result.changes > 0;
    },

    // Return a previously declared conflict, if one exists.
    conflict(judgeId, submissionId) {
      return db.prepare('SELECT * FROM conflicts WHERE judge_id=? AND submission_id=?').get(judgeId, submissionId) || null;
    },

    // Store a conflict and deactivate the judge's assignment in the same repository operation.
    createConflict(judgeId, submissionId, reason, declaredAt) {
      const result = db.prepare(`
        INSERT INTO conflicts(judge_id,submission_id,reason,declared_at,status)
        VALUES(?,?,?,?,'declared')
      `).run(judgeId, submissionId, reason, declaredAt);
      db.prepare(`
        UPDATE judge_assignments
        SET status='conflict'
        WHERE judge_id=? AND submission_id=?
      `).run(judgeId, submissionId);
      return Number(result.lastInsertRowid);
    },

    // Return an existing evaluation so duplicate evaluation submissions can be prevented.
    existingEvaluation(judgeId, submissionId) {
      return db.prepare('SELECT * FROM evaluations WHERE judge_id=? AND submission_id=?').get(judgeId, submissionId) || null;
    },

    // Store the evaluation and all criterion scores atomically.
    createEvaluation(judgeId, submissionId, totalScore, feedback, submittedAt, scores) {
      db.exec('BEGIN');
      try {
        // Insert the evaluation header containing the MVP weighted total and written feedback.
        const result = db.prepare(`
          INSERT INTO evaluations(judge_id,submission_id,total_score,feedback,submitted_at,status)
          VALUES(?,?,?,?,?,'submitted')
        `).run(judgeId, submissionId, totalScore, feedback, submittedAt);
        // Convert SQLite's integer row id to a normal JavaScript number.
        const evaluationId = Number(result.lastInsertRowid);
        // Prepare the child-row insert once and reuse it for every criterion.
        const addScore = db.prepare(`
          INSERT INTO criterion_scores(evaluation_id,criterion_id,score,comment)
          VALUES(?,?,?,?)
        `);
        // Store every score that the service already validated.
        for (const score of scores) {
          addScore.run(evaluationId, score.criterionId, score.score, score.comment || '');
        }
        // Commit only when both evaluation and scores have succeeded.
        db.exec('COMMIT');
        return evaluationId;
      } catch (error) {
        // Undo the whole evaluation if even one child score fails.
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}
