// Organizer business logic for challenge configuration, rubrics, judge assignment,
// judging-phase transition, provisional ranking, and result publication.
export function createOrganizerService(challenges, submissions, users, evaluations, results, audit) {
  // Read the current account so ownership checks are enforced in the business layer.
  function currentUser(userId) {
    const user = users.findById(userId);
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404, code: 'USER_NOT_FOUND' });
    }
    return user;
  }

  // Allow admins to manage everything; normal organizers may manage only their own challenges.
  function requireManageChallenge(userId, challengeId) {
    const user = currentUser(userId);
    const challenge = challenges.findById(challengeId);
    if (!challenge) {
      throw Object.assign(new Error('Challenge not found'), { status: 404, code: 'CHALLENGE_NOT_FOUND' });
    }
    if (user.role !== 'admin' && Number(challenge.organizer_id) !== Number(userId)) {
      throw Object.assign(new Error('You may manage only challenges assigned to you'), { status: 403, code: 'CHALLENGE_FORBIDDEN' });
    }
    return challenge;
  }

  // Validate fields required by D1 FR3 and FR4 before saving a challenge.
  function validateChallenge(raw, { creating = false } = {}) {
    const title = String(raw.title || '').trim();
    const description = String(raw.description || '').trim();
    const rules = String(raw.rules || '').trim();
    const minTeamSize = Number(raw.minTeamSize);
    const maxTeamSize = Number(raw.maxTeamSize);
    const registrationDeadline = new Date(String(raw.registrationDeadline || ''));
    const submissionDeadline = new Date(String(raw.submissionDeadline || ''));

    if (title.length < 3) {
      throw Object.assign(new Error('Challenge title must contain at least 3 characters'), { status: 400, code: 'INVALID_CHALLENGE_TITLE' });
    }
    if (description.length < 5) {
      throw Object.assign(new Error('Challenge description must contain at least 5 characters'), { status: 400, code: 'INVALID_CHALLENGE_DESCRIPTION' });
    }
    if (rules.length < 3) {
      throw Object.assign(new Error('Challenge rules are required'), { status: 400, code: 'CHALLENGE_RULES_REQUIRED' });
    }
    if (!Number.isInteger(minTeamSize) || !Number.isInteger(maxTeamSize) || minTeamSize < 1 || maxTeamSize < minTeamSize || maxTeamSize > 20) {
      throw Object.assign(new Error('Team-size limits are invalid'), { status: 400, code: 'INVALID_TEAM_SIZE_LIMITS' });
    }
    if (Number.isNaN(registrationDeadline.getTime()) || Number.isNaN(submissionDeadline.getTime())) {
      throw Object.assign(new Error('Both deadlines must be valid dates'), { status: 400, code: 'INVALID_DEADLINE' });
    }
    if (submissionDeadline.getTime() <= registrationDeadline.getTime()) {
      throw Object.assign(new Error('Submission deadline must be after registration deadline'), { status: 400, code: 'DEADLINE_ORDER_INVALID' });
    }
    if (submissionDeadline.getTime() <= Date.now()) {
      throw Object.assign(new Error('Submission deadline must be in the future'), { status: 400, code: 'SUBMISSION_DEADLINE_PAST' });
    }
    if (creating && registrationDeadline.getTime() <= Date.now()) {
      throw Object.assign(new Error('Registration deadline must be in the future for a new challenge'), { status: 400, code: 'REGISTRATION_DEADLINE_PAST' });
    }

    return {
      title,
      description,
      rules,
      minTeamSize,
      maxTeamSize,
      registrationDeadline: registrationDeadline.toISOString(),
      submissionDeadline: submissionDeadline.toISOString()
    };
  }

  // Validate a complete organizer-defined evaluation rubric.
  function validateRubric(rawCriteria) {
    if (!Array.isArray(rawCriteria) || rawCriteria.length < 1) {
      throw Object.assign(new Error('The rubric must contain at least one criterion'), { status: 400, code: 'RUBRIC_REQUIRED' });
    }
    if (rawCriteria.length > 10) {
      throw Object.assign(new Error('The MVP supports at most 10 rubric criteria'), { status: 400, code: 'TOO_MANY_CRITERIA' });
    }

    const criteria = rawCriteria.map((raw, index) => {
      const name = String(raw.name || '').trim();
      const description = String(raw.description || '').trim();
      const weightPercent = Number(raw.weightPercent);
      const maxScore = Number(raw.maxScore);

      if (!name) {
        throw Object.assign(new Error(`Criterion ${index + 1} needs a name`), { status: 400, code: 'CRITERION_NAME_REQUIRED' });
      }
      if (!Number.isFinite(weightPercent) || weightPercent <= 0 || weightPercent > 100) {
        throw Object.assign(new Error(`Weight for ${name} must be between 0 and 100`), { status: 400, code: 'INVALID_CRITERION_WEIGHT' });
      }
      if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000) {
        throw Object.assign(new Error(`Maximum score for ${name} must be greater than 0`), { status: 400, code: 'INVALID_MAX_SCORE' });
      }

      return { name, description, weightPercent, weight: weightPercent / 100, maxScore };
    });

    const normalizedNames = criteria.map((criterion) => criterion.name.toLowerCase());
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      throw Object.assign(new Error('Rubric criterion names must be unique'), { status: 400, code: 'DUPLICATE_CRITERION' });
    }

    const weightTotal = criteria.reduce((sum, criterion) => sum + criterion.weightPercent, 0);
    if (Math.abs(weightTotal - 100) > 0.01) {
      throw Object.assign(new Error(`Rubric weights must add to 100% (current total: ${weightTotal}%)`), { status: 400, code: 'RUBRIC_WEIGHT_TOTAL' });
    }

    return criteria;
  }

  // Expose organizer operations required for the complete D2 MVP flow.
  return {
    // List challenges the current organizer is allowed to manage.
    listChallenges(userId) {
      const user = currentUser(userId);
      const rows = user.role === 'admin' ? challenges.list() : challenges.listForOrganizer(userId);
      return rows.map((challenge) => ({
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        rules: challenge.rules,
        minTeamSize: challenge.min_team_size,
        maxTeamSize: challenge.max_team_size,
        registrationDeadline: challenge.registration_deadline,
        submissionDeadline: challenge.submission_deadline,
        status: challenge.status,
        publishedAt: challenge.published_at
      }));
    },

    // Create a challenge from the organizer dashboard instead of relying only on seed data.
    createChallenge(userId, raw) {
      const user = currentUser(userId);
      if (!['organizer', 'admin'].includes(user.role)) {
        throw Object.assign(new Error('Organizer role required'), { status: 403, code: 'FORBIDDEN' });
      }
      const input = validateChallenge(raw, { creating: true });
      const challengeId = challenges.create({ ...input, organizerId: userId });
      audit.add(userId, 'CHALLENGE_CREATED', 'challenge', challengeId, input);
      return { challengeId, status: 'open' };
    },

    // Edit challenge description, rules, team-size limits, and deadlines while it is open.
    updateChallenge(userId, challengeId, raw) {
      const before = requireManageChallenge(userId, challengeId);
      if (before.status !== 'open') {
        throw Object.assign(new Error('Challenge configuration is locked after judging starts'), { status: 409, code: 'CHALLENGE_LOCKED' });
      }

      const input = validateChallenge(raw);
      challenges.update(challengeId, input);
      audit.add(userId, 'CHALLENGE_UPDATED', 'challenge', challengeId, input);

      const oldRegistration = Date.parse(before.registration_deadline);
      const newRegistration = Date.parse(input.registrationDeadline);
      const oldSubmission = Date.parse(before.submission_deadline);
      const newSubmission = Date.parse(input.submissionDeadline);

      if (newRegistration > oldRegistration) {
        audit.add(userId, 'REGISTRATION_DEADLINE_EXTENDED', 'challenge', challengeId, {
          oldDeadline: before.registration_deadline,
          newDeadline: input.registrationDeadline
        });
      } else if (newRegistration < oldRegistration) {
        audit.add(userId, 'DEADLINE_OVERRIDE', 'challenge', challengeId, {
          deadlineType: 'registration',
          oldDeadline: before.registration_deadline,
          newDeadline: input.registrationDeadline
        });
      }

      if (newSubmission > oldSubmission) {
        audit.add(userId, 'SUBMISSION_DEADLINE_EXTENDED', 'challenge', challengeId, {
          oldDeadline: before.submission_deadline,
          newDeadline: input.submissionDeadline
        });
      } else if (newSubmission < oldSubmission) {
        audit.add(userId, 'DEADLINE_OVERRIDE', 'challenge', challengeId, {
          deadlineType: 'submission',
          oldDeadline: before.submission_deadline,
          newDeadline: input.submissionDeadline
        });
      }

      return { challengeId, status: 'updated' };
    },

    // Show only submissions belonging to challenges the organizer can manage.
    listSubmissions(userId) {
      const user = currentUser(userId);
      const all = submissions.listForOrganizer();
      if (user.role === 'admin') return all;
      const allowed = new Set(challenges.listForOrganizer(userId).map((challenge) => Number(challenge.id)));
      return all.filter((submission) => allowed.has(Number(submission.challengeId)));
    },

    // Show available judge accounts in the assignment dropdown.
    listJudges() {
      return users.listJudges();
    },

    // Return one challenge's current rubric in organizer-editable percentage form.
    getRubric(userId, challengeId) {
      const challenge = requireManageChallenge(userId, challengeId);
      return {
        challengeId,
        editable: challenge.status === 'open' && challenges.evaluationCount(challengeId) === 0,
        criteria: challenges.criteria(challengeId).map((criterion) => ({
          ...criterion,
          weightPercent: Math.round(Number(criterion.weight) * 10000) / 100
        }))
      };
    },

    // Replace the rubric while the competition is open and before evaluations exist.
    updateRubric(userId, challengeId, rawCriteria) {
      const challenge = requireManageChallenge(userId, challengeId);
      if (challenge.status !== 'open') {
        throw Object.assign(new Error('The rubric is locked after judging starts'), { status: 409, code: 'RUBRIC_LOCKED' });
      }
      if (challenges.evaluationCount(challengeId) > 0) {
        throw Object.assign(new Error('The rubric cannot change after an evaluation is stored'), { status: 409, code: 'RUBRIC_HAS_EVALUATIONS' });
      }

      const criteria = validateRubric(rawCriteria);
      challenges.replaceCriteria(challengeId, criteria);
      audit.add(userId, 'RUBRIC_UPDATED', 'challenge', challengeId, {
        criteria: criteria.map((criterion) => ({
          name: criterion.name,
          weightPercent: criterion.weightPercent,
          maxScore: criterion.maxScore
        }))
      });
      return this.getRubric(userId, challengeId);
    },

    // Assign a valid judge account to one submitted project owned by this organizer's challenge.
    assignJudge(userId, submissionId, judgeId) {
      const submission = submissions.findById(submissionId);
      if (!submission) {
        throw Object.assign(new Error('Submission not found'), { status: 404, code: 'SUBMISSION_NOT_FOUND' });
      }
      requireManageChallenge(userId, submission.challenge_id);

      const judge = users.findById(judgeId);
      if (!judge || judge.role !== 'judge') {
        throw Object.assign(new Error('Judge not found'), { status: 404, code: 'JUDGE_NOT_FOUND' });
      }

      evaluations.assignJudge(judgeId, submissionId, new Date().toISOString());
      audit.add(userId, 'JUDGE_ASSIGNED', 'submission', submissionId, { judgeId });
      return { status: 'assigned' };
    },

    // Close submissions and move one challenge into judging after its rubric is configured.
    startJudging(userId, challengeId) {
      const challenge = requireManageChallenge(userId, challengeId);
      if (challenge.status !== 'open') {
        throw Object.assign(new Error('Judging has already started'), { status: 409, code: 'JUDGING_ALREADY_STARTED' });
      }
      if (challenges.criteria(challengeId).length < 1) {
        throw Object.assign(new Error('Configure the evaluation rubric before starting judging'), { status: 409, code: 'RUBRIC_REQUIRED' });
      }

      const deadline = new Date(Date.now() - 1000).toISOString();
      challenges.setJudging(challengeId, deadline);
      audit.add(userId, 'DEADLINE_OVERRIDE', 'challenge', challengeId, {
        newSubmissionDeadline: deadline,
        reason: 'Organizer started judging phase'
      });
      audit.add(userId, 'JUDGING_STARTED', 'challenge', challengeId, {});
      return { status: 'judging', submissionDeadline: deadline };
    },

    // Return the current provisional ranking and whether every submitted project is evaluated.
    getRanking(userId, challengeId) {
      const challenge = requireManageChallenge(userId, challengeId);
      const submissionCount = results.submissionCount(challengeId);
      const evaluatedSubmissionCount = results.evaluatedSubmissionCount(challengeId);
      return {
        challengeId,
        challengeStatus: challenge.status,
        formula: 'D2 MVP provisional ranking: average of judge weighted totals',
        submissionCount,
        evaluatedSubmissionCount,
        readyToPublish: submissionCount > 0 && submissionCount === evaluatedSubmissionCount,
        ranking: results.ranking(challengeId)
      };
    },

    // Publish results only after every submitted project has at least one stored evaluation.
    publishResults(userId, challengeId) {
      const challenge = requireManageChallenge(userId, challengeId);
      if (challenge.status !== 'judging') {
        throw Object.assign(new Error('Results can be published only during the judging phase'), { status: 409, code: 'RESULTS_NOT_READY' });
      }

      const submissionCount = results.submissionCount(challengeId);
      const evaluatedSubmissionCount = results.evaluatedSubmissionCount(challengeId);
      if (submissionCount < 1) {
        throw Object.assign(new Error('There are no submitted projects to rank'), { status: 409, code: 'NO_SUBMISSIONS' });
      }
      if (submissionCount !== evaluatedSubmissionCount) {
        throw Object.assign(new Error('Every submitted project needs at least one evaluation before results are published'), { status: 409, code: 'INCOMPLETE_JUDGING' });
      }

      const publishedAt = new Date().toISOString();
      challenges.setPublished(challengeId, publishedAt);
      const ranking = results.ranking(challengeId);
      audit.add(userId, 'RESULTS_PUBLISHED', 'challenge', challengeId, {
        formula: 'average of judge provisional weighted totals',
        rankedTeams: ranking.length
      });
      return { status: 'published', publishedAt, ranking };
    }
  };
}
