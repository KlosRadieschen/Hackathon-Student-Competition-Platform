# Core module contracts — complete D2 MVP

## createChallenge(userId, challengeData)
- **Takes:** organizer/admin ID; title, description, rules, min/max team size, registration/submission deadlines
- **Gives back:** challenge ID and `open` status
- **Can fail with:** invalid title/description/rules/team sizes/deadlines
- **Promises:** challenge is owned by the creating organizer and `CHALLENGE_CREATED` is audited

## updateChallenge(userId, challengeId, challengeData)
- **Takes:** organizer/admin ID, owned challenge ID, edited challenge data
- **Gives back:** updated status
- **Can fail with:** `CHALLENGE_NOT_FOUND`, `CHALLENGE_FORBIDDEN`, `CHALLENGE_LOCKED`, validation errors
- **Promises:** open challenge configuration changes are persisted; deadline extensions/overrides are auditable

## registerTeam(userId, challengeId)
- **Takes:** authenticated participant ID, challenge ID
- **Gives back:** registration ID and `registered` status
- **Can fail with:** `TEAM_REQUIRED`, `TEAM_SIZE_INVALID`, `REGISTRATION_CLOSED`, `ALREADY_REGISTERED`, `TEAM_ALREADY_REGISTERED`
- **Promises:** only eligible teams register while registration is open; one challenge per team is enforced for the MVP

## submitProject(userId, registrationId, submissionData)
- **Takes:** participant ID, registration ID, repository link, description, optional artifact
- **Gives back:** submission ID, stored/updated status, timestamped receipt
- **Can fail with:** `REGISTRATION_NOT_FOUND`, `FORBIDDEN`, `SUBMISSION_CLOSED`, `INVALID_REPOSITORY_LINK`, `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`
- **Promises:** only the owning team can submit; one active submission exists; update without new artifact preserves current artifact; version history is not created

## updateRubric(userId, challengeId, criteria)
- **Takes:** organizer/admin ID, owned challenge ID, criteria with name, description, weight %, max score
- **Gives back:** persisted rubric
- **Can fail with:** challenge/ownership errors, `RUBRIC_REQUIRED`, `DUPLICATE_CRITERION`, `RUBRIC_WEIGHT_TOTAL`, `RUBRIC_LOCKED`, validation errors
- **Promises:** rubric is replaced atomically; weights total 100%; changes are audited; rubric locks after judging starts

## assignJudge(userId, submissionId, judgeId)
- **Takes:** organizer/admin ID, submitted project ID, judge ID
- **Gives back:** assigned status
- **Can fail with:** missing submission/judge or organizer ownership error
- **Promises:** active assignment exists and assignment is audited; reassignment can use a different judge after conflict

## confirmNoConflict(judgeId, submissionId)
- **Takes:** assigned judge ID, submission ID
- **Gives back:** `cleared` status
- **Can fail with:** `NOT_ASSIGNED`, `CONFLICT_DECLARED`, `ALREADY_EVALUATED`
- **Promises:** full project content/rubric remains unavailable until this succeeds

## declareConflict(judgeId, submissionId, reason)
- **Takes:** assigned judge ID, submission ID, short reason
- **Gives back:** conflict ID and `reassignmentRequired=true`
- **Can fail with:** `NOT_ASSIGNED`, `CONFLICT_REASON_REQUIRED`, `ALREADY_EVALUATED`, `CONFLICT_ALREADY_DECLARED`
- **Promises:** assignment becomes inactive; judge cannot evaluate; conflict and reassignment requirement are audited

## submitEvaluation(judgeId, submissionId, scores, feedback)
- **Takes:** assigned judge ID, submission ID, one score per criterion, written feedback
- **Gives back:** evaluation ID, provisional weighted total, status
- **Can fail with:** assignment/conflict errors, `EVALUATION_NOT_OPEN`, `INCOMPLETE_EVALUATION`, `INVALID_SCORE`, `FEEDBACK_REQUIRED`
- **Promises:** every configured criterion is valid; evaluation and child scores are stored atomically; total is explicitly provisional

## publishResults(userId, challengeId)
- **Takes:** organizer/admin ID, owned challenge ID
- **Gives back:** published status, publication timestamp, ranking
- **Can fail with:** `RESULTS_NOT_READY`, `NO_SUBMISSIONS`, `INCOMPLETE_JUDGING`, ownership errors
- **Promises:** results publish only after every submitted project has at least one evaluation; publication is audited
