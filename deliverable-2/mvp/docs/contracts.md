# Core module contracts — complete D2 MVP

## register(name, email, password)
- **Takes:** display name, email, password
- **Gives back:** signed access token and the new user (role `participant`)
- **Can fail with:** `INVALID_NAME`, `INVALID_EMAIL`, `WEAK_PASSWORD` (under 8 characters, or no letter or no number), `EMAIL_TAKEN`
- **Promises:** password is stored as a salted scrypt hash; sign-up can only create participants; `USER_REGISTERED` is audited

## joinTeam(userId, inviteCode) / leaveTeam(userId)
- **Takes:** participant ID, and the invite code for joining
- **Gives back:** the joined team, or `{ teamDeleted, ownerUserId }` after leaving
- **Can fail with:** `ALREADY_IN_TEAM`, `INVITE_NOT_FOUND`, `TEAM_FULL`, `NOT_IN_TEAM`, `TEAM_SIZE_INVALID`, `TEAM_LOCKED`
- **Promises:** a registered team stays within its challenge's min/max size; membership locks once submissions close; ownership passes to the longest-standing member; an empty unregistered team is deleted

## createChallenge(userId, challengeData)
- **Takes:** organizer/admin ID; title, description, rules, min/max team size, registration/submission deadlines
- **Gives back:** challenge ID and `open` status
- **Can fail with:** invalid title/description/rules/team sizes/deadlines
- **Promises:** challenge is owned by the creating organizer and `CHALLENGE_CREATED` is audited

## updateChallenge(userId, challengeId, challengeData)
- **Takes:** organizer/admin ID, owned challenge ID, edited challenge data
- **Gives back:** updated status
- **Can fail with:** `CHALLENGE_NOT_FOUND`, `CHALLENGE_FORBIDDEN`, `CHALLENGE_LOCKED`, `TEAM_SIZE_CONFLICT` (new limits would exclude a registered team), `CAPACITY_CONFLICT` (maximum teams below current registrations), `INVALID_CAPACITY`, validation errors
- **Promises:** open challenge configuration changes are persisted; deadline extensions/overrides are auditable

## registerTeam(userId, challengeId)
- **Takes:** authenticated participant ID, challenge ID
- **Gives back:** registration ID and `registered` status
- **Can fail with:** `TEAM_REQUIRED`, `TEAM_SIZE_INVALID`, `REGISTRATION_CLOSED`, `ALREADY_REGISTERED`, `TEAM_ALREADY_REGISTERED`, `CHALLENGE_FULL`
- **Promises:** only eligible teams register while registration is open; one challenge per team is enforced for the MVP

## submitProject(userId, registrationId, submissionData)
- **Takes:** participant ID, registration ID, repository link, description, optional artifact
- **Gives back:** submission ID, stored/updated status, timestamped receipt
- **Can fail with:** `REGISTRATION_NOT_FOUND`, `FORBIDDEN`, `SUBMISSION_CLOSED`, `INVALID_REPOSITORY_LINK`, `SUBMISSION_DESCRIPTION_REQUIRED`, `SUBMISSION_CONTENT_REQUIRED`, `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `MALWARE_DETECTED`, `FILE_CONTENT_MISMATCH`, `SCAN_UNAVAILABLE`
- **Gives back (also):** the new version number
- **Promises:** only the owning team can submit; a description plus a repository link or file is required; every new artifact is scanned before it is stored; one active submission exists; an update archives the previous version (and keeps its file) in history; update without new artifact preserves current artifact; file errors name the file and the deadline error shows the deadline; every failed attempt is audited as `UPLOAD_FAILED`

## updateRubric(userId, challengeId, criteria)
- **Takes:** organizer/admin ID, owned challenge ID, criteria with name, description, weight %, max score
- **Gives back:** persisted rubric
- **Can fail with:** challenge/ownership errors, `RUBRIC_REQUIRED`, `DUPLICATE_CRITERION`, `RUBRIC_WEIGHT_TOTAL`, `RUBRIC_LOCKED`, validation errors
- **Promises:** rubric is replaced atomically; weights total 100%; changes are audited; rubric locks after judging starts

## assignJudge(userId, submissionId, judgeId)
- **Takes:** organizer/admin ID, submitted project ID, judge ID
- **Gives back:** assigned status
- **Can fail with:** missing submission/judge, organizer ownership error, `JUDGE_HAS_CONFLICT` (that judge declared a conflict for this project)
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

## Admin operations: changeRole, resetAccount, uploadErrors, createBackup
- **Takes:** admin ID, plus the target user ID and new role for role changes
- **Gives back:** updated user; `{ temporaryPassword }` for a reset; `UPLOAD_FAILED` events; backup manifest `{ name, createdAt, reason, artifactCount }`
- **Can fail with:** `USER_NOT_FOUND`, `INVALID_ROLE`, `CANNOT_CHANGE_OWN_ROLE`, `USER_IN_TEAM`
- **Promises:** only admins reach these routes; role changes, resets, and backups are audited; the temporary password is returned once and never logged; backups copy the database and every artifact and keep the newest 14
