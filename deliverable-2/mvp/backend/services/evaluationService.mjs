// Create the service that owns all judge conflict and evaluation business rules.
export function createEvaluationService(challenges, submissions, evaluations, audit) {
  // Reuse one assignment guard across conflict, preview, and evaluation operations.
  function requireAssignment(judgeId, submissionId) {
    const assignment = evaluations.assignment(judgeId, submissionId);
    if (!assignment) {
      throw Object.assign(new Error('You are not assigned to this submission'), { status: 403, code: 'NOT_ASSIGNED' });
    }
    return assignment;
  }

  // Expose the judge workflow as explicit operations.
  return {
    // List only enough assignment identity for a judge to decide conflict of interest.
    listAssignments(judgeId) {
      return evaluations.listAssignments(judgeId);
    },

    // Record the judge's explicit "no conflict" decision before full project content is revealed.
    confirmNoConflict(judgeId, submissionId) {
      const assignment = requireAssignment(judgeId, submissionId);

      // A stored conflict always wins over a later no-conflict attempt.
      if (evaluations.conflict(judgeId, submissionId)) {
        throw Object.assign(new Error('Conflict already declared for this submission'), { status: 409, code: 'CONFLICT_DECLARED' });
      }

      // Do not reopen the conflict check after the judge has already completed an evaluation.
      if (evaluations.existingEvaluation(judgeId, submissionId)) {
        throw Object.assign(new Error('Evaluation already submitted'), { status: 409, code: 'ALREADY_EVALUATED' });
      }

      // Repeated confirmation is harmless and returns the same workflow state.
      if (assignment.conflict_checked_at) {
        return { status: 'cleared', alreadyConfirmed: true };
      }

      // Store the confirmation timestamp on the assignment itself.
      evaluations.markNoConflict(judgeId, submissionId, new Date().toISOString());
      // Audit the fairness-relevant decision separately from authentication.
      audit.add(judgeId, 'CONFLICT_CHECK_CLEARED', 'submission', submissionId, {});
      return { status: 'cleared', alreadyConfirmed: false };
    },

    // Load full project details and the rubric only after the conflict check is complete.
    loadData(judgeId, submissionId) {
      const assignment = requireAssignment(judgeId, submissionId);

      // Conflict declaration deactivates the assignment, but keep this guard explicit as defense in depth.
      if (evaluations.conflict(judgeId, submissionId)) {
        throw Object.assign(new Error('Conflict already declared for this submission'), { status: 409, code: 'CONFLICT_DECLARED' });
      }

      // This is the key D1-feedback correction: project content is hidden until conflict is cleared.
      if (!assignment.conflict_checked_at) {
        throw Object.assign(new Error('Confirm that there is no conflict of interest before opening the project'), { status: 409, code: 'CONFLICT_CHECK_REQUIRED' });
      }

      const submission = submissions.findById(submissionId);
      if (!submission) {
        throw Object.assign(new Error('Submission not found'), { status: 404, code: 'SUBMISSION_NOT_FOUND' });
      }

      // Load the organizer-configured rubric linked to the submission's challenge.
      const criteria = challenges.criteria(submission.challenge_id);
      return {
        submission: {
          id: submission.id,
          teamName: submission.team_name,
          challengeTitle: submission.challenge_title,
          repositoryLink: submission.repository_link,
          description: submission.description,
          artifactName: submission.artifact_name
        },
        criteria
      };
    },

    // Let a judge declare a conflict before evaluating the project.
    declareConflict(judgeId, submissionId, reason) {
      requireAssignment(judgeId, submissionId);

      // A short written reason makes the fairness decision auditable without overcomplicating the MVP.
      const clean = String(reason || '').trim();
      if (clean.length < 3) {
        throw Object.assign(new Error('Please provide a short reason'), { status: 400, code: 'CONFLICT_REASON_REQUIRED' });
      }

      // Once evaluation is submitted, the assignment cannot be retroactively converted to a conflict.
      if (evaluations.existingEvaluation(judgeId, submissionId)) {
        throw Object.assign(new Error('Evaluation already submitted'), { status: 409, code: 'ALREADY_EVALUATED' });
      }

      // Prevent duplicate conflict records for the same judge/submission pair.
      if (evaluations.conflict(judgeId, submissionId)) {
        throw Object.assign(new Error('Conflict already declared'), { status: 409, code: 'CONFLICT_ALREADY_DECLARED' });
      }

      // Store the conflict and deactivate the assignment.
      const conflictId = evaluations.createConflict(judgeId, submissionId, clean, new Date().toISOString());
      // Log the declaration itself.
      audit.add(judgeId, 'CONFLICT_DECLARED', 'conflict', conflictId, { submissionId, reason: clean });
      // Log the operational consequence separately so organizers can see reassignment is needed.
      audit.add(judgeId, 'JUDGE_REASSIGNMENT_REQUIRED', 'submission', submissionId, { previousJudgeId: judgeId });
      return { conflictId, status: 'declared', reassignmentRequired: true };
    },

    // Validate and store one completed rubric evaluation.
    submit(judgeId, submissionId, payload) {
      const assignment = requireAssignment(judgeId, submissionId);

      // An explicit conflict blocks evaluation completely.
      if (evaluations.conflict(judgeId, submissionId)) {
        throw Object.assign(new Error('You declared a conflict for this submission'), { status: 409, code: 'CONFLICT_DECLARED' });
      }

      // Judges must confirm no conflict before scoring.
      if (!assignment.conflict_checked_at) {
        throw Object.assign(new Error('Complete the conflict-of-interest check before evaluating'), { status: 409, code: 'CONFLICT_CHECK_REQUIRED' });
      }

      // One judge stores at most one final evaluation for a submission in the D2 MVP.
      if (evaluations.existingEvaluation(judgeId, submissionId)) {
        throw Object.assign(new Error('Evaluation already submitted'), { status: 409, code: 'ALREADY_EVALUATED' });
      }

      const submission = submissions.findById(submissionId);
      if (!submission) {
        throw Object.assign(new Error('Submission not found'), { status: 404, code: 'SUBMISSION_NOT_FOUND' });
      }

      // Evaluation is allowed only after the challenge has moved to judging or the submission deadline has passed.
      if (submission.challenge_status !== 'judging' && Date.now() <= Date.parse(submission.submission_deadline)) {
        throw Object.assign(new Error('Evaluation is not open until submissions close'), { status: 409, code: 'EVALUATION_NOT_OPEN' });
      }

      // Read the live organizer-configured criteria for the challenge.
      const criteria = challenges.criteria(submission.challenge_id);
      // Index the submitted score rows by criterion id for efficient validation.
      const scoreMap = new Map((payload.scores || []).map((score) => [Number(score.criterionId), score]));

      // Every configured criterion must be scored; missing one makes the evaluation incomplete.
      if (!criteria.length || criteria.some((criterion) => !scoreMap.has(Number(criterion.id)))) {
        throw Object.assign(new Error('Every rubric criterion must be scored'), { status: 400, code: 'INCOMPLETE_EVALUATION' });
      }

      // Normalize validated score rows before giving them to the repository.
      const normalized = [];
      // Accumulate the D2 MVP's provisional weighted total on a 0..100 scale.
      let weighted = 0;

      // Validate each score against the criterion's configured maximum.
      for (const criterion of criteria) {
        const raw = scoreMap.get(Number(criterion.id));
        const score = Number(raw.score);
        if (!Number.isFinite(score) || score < 0 || score > Number(criterion.maxScore)) {
          throw Object.assign(
            new Error(`Score for ${criterion.name} must be between 0 and ${criterion.maxScore}`),
            { status: 400, code: 'INVALID_SCORE' }
          );
        }

        // Convert the criterion score into its weighted contribution to the provisional total.
        weighted += (score / Number(criterion.maxScore)) * Number(criterion.weight) * 100;
        // Preserve optional criterion comments for future reporting without making them mandatory.
        normalized.push({
          criterionId: Number(criterion.id),
          score,
          comment: String(raw.comment || '')
        });
      }

      // D1 requires written feedback, so a blank evaluation is rejected.
      const feedback = String(payload.feedback || '').trim();
      if (feedback.length < 3) {
        throw Object.assign(new Error('Written feedback is required'), { status: 400, code: 'FEEDBACK_REQUIRED' });
      }

      // Round the MVP weighted total to two decimals for display and persistence.
      const totalScore = Math.round(weighted * 100) / 100;
      // Persist evaluation header and criterion scores atomically.
      const evaluationId = evaluations.createEvaluation(
        judgeId,
        submissionId,
        totalScore,
        feedback,
        new Date().toISOString(),
        normalized
      );
      // Record the completed evaluation in the audit trail.
      audit.add(judgeId, 'EVALUATION_SUBMITTED', 'evaluation', evaluationId, {
        submissionId,
        provisionalWeightedTotal: totalScore
      });
      return {
        evaluationId,
        totalScore,
        scoreMeaning: 'D2 MVP provisional weighted total',
        status: 'submitted'
      };
    }
  };
}
