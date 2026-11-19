# Code walkthrough — complete D2 MVP

The code follows the Week 8/9 structure deliberately:

```text
Browser UI
   ↓ HTTP/JSON
Controller / routes
   ↓ named service operations
Services / business rules
   ↓ focused repository operations
Repositories / SQL
   ↓
SQLite + upload directory
```

## 1. `backend/server.mjs`
This is the composition root. It opens SQLite, seeds demo data, creates repositories/services, registers the routes, and starts the HTTP server. Business rules do not belong here.

## 2. `backend/controllers/apiController.mjs`
This defines the REST API. A route authenticates the user, checks the role, reads request data, calls a service, and returns the answer.

Important routes include:
- `POST /api/organizer/challenges` — create challenge
- `PUT /api/organizer/challenges/:id` — edit challenge/deadlines
- `POST /api/challenges/:id/register` — UC2 registration
- `POST /api/registrations/:id/submission` — UC1 create/update active submission
- `GET/PUT /api/challenges/:id/rubric` — configurable rubric
- `POST /api/submissions/:id/assign-judge` — judge assignment/reassignment
- `POST /api/submissions/:id/no-conflict` — explicit no-conflict decision
- `POST /api/submissions/:id/conflicts` — conflict declaration
- `GET /api/submissions/:id/evaluation-data` — project/rubric after conflict clearance
- `POST /api/submissions/:id/evaluations` — UC3 evaluation
- `GET /api/challenges/:id/ranking` — provisional ranking
- `POST /api/challenges/:id/publish-results` — result publication
- `GET /api/results/me` — participant published result

Controllers never query SQLite directly.

## 3. `backend/services/organizerService.mjs`
This owns organizer decisions.

### Challenge configuration
`createChallenge()` and `updateChallenge()` validate title, description, rules, team sizes, and deadline ordering. Challenge ownership is checked so an organizer manages only their own challenges (admin may manage all).

Deadline extensions and shorter organizer overrides are recorded as explicit audit events.

### Rubric configuration
`updateRubric()` validates at least one criterion, unique names, positive values, and exactly 100% total weight for the classroom MVP. Rubric edits are locked after judging begins.

### Judge management
`assignJudge()` validates the submitted project and judge account. After a conflict, a different judge can be assigned.

### Judging and publication
`startJudging()` closes submissions and locks challenge/rubric configuration. `getRanking()` builds the provisional MVP ranking. `publishResults()` requires every submitted project to have at least one evaluation before publication.

## 4. `backend/services/registrationService.mjs`
UC2 logic checks:
- challenge exists;
- registration is open;
- participant has a team;
- team size matches configured min/max;
- team is not already registered;
- D1 assumption of one challenge per team.

## 5. `backend/services/submissionService.mjs`
UC1 logic checks:
- registration exists;
- participant belongs to the registered team;
- challenge/submission deadline is open;
- repository URL format;
- optional artifact prototype type/size restrictions.

It stores one active submission per registration. Updates replace active values rather than keeping version history. If no new artifact is supplied, the previous artifact is preserved. The response includes the same stored timestamp used for the participant receipt.

## 6. `backend/services/evaluationService.mjs`
This contains the teacher-feedback correction.

### Assignment identity only
`listAssignments()` exposes team/challenge identity but not repository, description, artifact, or rubric.

### Conflict check first
Judge chooses either:
- `declareConflict()` — stores conflict, deactivates assignment, logs reassignment required; or
- `confirmNoConflict()` — records that conflict has been checked.

### Project opens only after clearance
`loadData()` returns `CONFLICT_CHECK_REQUIRED` until no-conflict confirmation exists.

### Evaluation
`submit()` verifies active assignment, no conflict, completed conflict check, judging phase, complete rubric scores, score ranges, and written feedback. It stores evaluation + criterion scores atomically and returns the clearly-labelled provisional weighted total.

## 7. `backend/repositories/resultRepository.mjs` and `resultService.mjs`
The result repository calculates the D2 MVP provisional ranking from the average of judge weighted totals. The result service exposes a participant's result only after the challenge status becomes `published`. Written feedback is shown without judge names.

## 8. Frontend components

### `participant-view.ts`
- team create/join;
- challenge search;
- challenge rules/deadlines;
- registration;
- submission/update;
- timestamped receipt;
- published rank/score/feedback.

### `organizer-view.ts`
- create/edit challenge;
- deadline and team-size configuration;
- rubric editor;
- judge assignment/reassignment;
- start judging;
- provisional ranking;
- publish results;
- audit log.

### `judge-view.ts`
- assignment identity;
- conflict choice;
- project/rubric after clearance;
- criterion scoring + feedback;
- evaluation submission.

## 9. Repositories
Repositories hide SQL details:
- `challengeRepository.mjs`
- `teamRepository.mjs`
- `registrationRepository.mjs`
- `submissionRepository.mjs`
- `evaluationRepository.mjs`
- `resultRepository.mjs`
- `auditRepository.mjs`
- `userRepository.mjs`

## 10. Tests
`backend/tests/services.test.mjs` contains 12 requirement-based tests. They test business rules rather than only HTML rendering.

## 11. Generated frontend files
`npm run build` compiles TypeScript from `frontend/src/` into `frontend/public/`.

Edit the TypeScript source, not compiled JavaScript.
