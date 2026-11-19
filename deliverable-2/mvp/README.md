# Hackathon & Student Competition Platform — D2 MVP

This package continues directly from Deliverable 1. It implements the selected core use cases for Deliverable 2 and closes the main consistency gaps identified in the instructor feedback.

## What the MVP now supports

### Organizer
- Create a challenge with title, description, rules, minimum/maximum team size, registration deadline, and submission deadline.
- Edit an open challenge and extend/change deadlines.
- Configure the evaluation rubric by adding/removing/editing criteria, weights, descriptions, and maximum scores.
- Assign or reassign judges to submitted projects.
- Start the judging phase, which closes submissions and locks challenge/rubric configuration.
- View the provisional ranking after evaluations are submitted.
- Publish results after every submitted project has at least one evaluation.
- Inspect the audit log.

### Participant
- Log in with a demo account.
- Create a team or join one with an invite code.
- Search/browse challenges.
- Read challenge description, rules, team-size limits, and deadlines.
- Register an eligible team for one challenge.
- Submit a repository link, description, and optional artifact.
- Update the same active submission before the deadline.
- See a timestamped submission receipt.
- After results are published, see team rank, provisional score, and written judge feedback.

### Judge
- See assigned team/challenge identity first without project details.
- Declare a conflict of interest before project content is opened.
- Or explicitly confirm no conflict and then open project details/rubric.
- Score every configured criterion and provide written feedback.
- Submit one final evaluation.

### Conflict reassignment
- A declared conflict deactivates that assignment.
- The audit log records `CONFLICT_DECLARED` and `JUDGE_REASSIGNMENT_REQUIRED`.
- A second seeded judge is available so the organizer can actually demonstrate reassignment.

## D1 feedback addressed

1. **Conflict of interest** is MVP behavior and happens before project content/rubric is exposed.
2. **ConflictOfInterest, EvaluationCriterion, and CriterionScore** are real persisted concepts.
3. **University concerns** are supported through fairness rules, auditability, configurable data, simple deployment, and reuse.
4. **Activity logging** is concrete and separate from authentication.
5. **Version history** is not falsely implemented: there is one active submission, editable before the deadline.
6. **Challenge creation/editing** is available to organizers rather than relying only on seed data.
7. **End-to-end publish flow** is available: evaluation → provisional ranking → organizer publication → participant results.

## Important MVP design decisions

### Provisional scoring/ranking
Deliverable 1 left the final scoring formula open. Therefore the D2 MVP makes an explicit prototype choice:

- each evaluation gets a **provisional weighted total** from organizer-defined rubric weights;
- when a project has multiple judge evaluations, the MVP ranking uses the **average of those judge weighted totals**;
- this is clearly labelled as a D2 MVP formula and can be replaced later if the team chooses another final competition formula.

### Artifact restriction
D1 requires upload type/size validation but does not define exact values. The MVP uses:
- PDF, ZIP, TXT, MD
- maximum 1 MB

These are prototype constraints, not new D1 requirements.

## Architecture

```text
Browser UI
   ↓ HTTP/JSON
Controllers / REST routes
   ↓
Business services
   ↓
Repositories
   ↓
SQLite + artifact directory
```

- Client–Server
- Layered modular monolith
- Node.js 22+ backend
- TypeScript component-based browser UI
- SQLite persistence
- signed access tokens and scrypt password hashing
- explicit audit log

## Requirements

- Node.js 22 or newer
- macOS/Linux terminal for the supplied reset script

The compiled browser JavaScript is included. You do **not** need TypeScript just to run the demo.

## Clean start

```bash
npm run reset
npm start
```

Open:

```text
http://127.0.0.1:3000
```

## Demo accounts

All passwords are:

```text
Pass123!
```

| Role | Email |
|---|---|
| Participant | participant@example.com |
| Second participant | participant2@example.com |
| Organizer | organizer@example.com |
| Judge 1 | judge@example.com |
| Judge 2 | judge2@example.com |
| Admin | admin@example.com |

## Recommended full successful demo

1. Log in as `organizer@example.com`.
2. Either use the seeded challenge or create a new challenge.
3. Edit challenge rules/team sizes/deadlines if desired.
4. Configure and save a rubric whose weights total 100%.
5. Log out.
6. Log in as `participant@example.com`.
7. Create a team.
8. Search/select the challenge and register.
9. Submit a repository link and description; artifact is optional.
10. Note the timestamped receipt.
11. Log out.
12. Log in as organizer.
13. Assign Judge Demo.
14. Start judging only after submissions are ready.
15. Log out.
16. Log in as `judge@example.com`.
17. Choose **No conflict — continue**.
18. Open the project/rubric.
19. Score every criterion and add written feedback.
20. Submit evaluation.
21. Log out and log in as organizer.
22. Check the provisional ranking.
23. Publish results.
24. Log in again as the participant and view rank/score/feedback.

## Recommended conflict/reassignment demo

1. Run a clean reset and create/register/submit as above.
2. Organizer assigns `judge@example.com` and starts judging.
3. Judge 1 declares a conflict and gives a short reason.
4. Organizer sees reassignment events in the audit log.
5. Organizer assigns `judge2@example.com`.
6. Judge 2 completes their own conflict check and can evaluate normally.

## Automated tests

```bash
npm test
```

The complete suite contains **12 tests** covering:

1. valid/invalid authentication;
2. configured team-size registration rule;
3. one challenge per team;
4. submission deadline enforcement;
5. active-submission update/artifact preservation + timestamp;
6. project details hidden until conflict clearance;
7. conflict blocking, reassignment logging, and replacement-judge access;
8. organizer rubric editing and 100% weight rule;
9. rubric locking after judging starts;
10. complete configurable-rubric evaluation and provisional weighted total;
11. organizer challenge create/edit + deadline audit events;
12. ranking, result publication, and participant feedback visibility.

## Editing frontend source

If you change `frontend/src/*.ts`, install the development dependency and rebuild:

```bash
npm install
npm run build
```

Do not edit the generated files under `frontend/public/*.js` directly.

## Project structure

```text
backend/
  auth/          authentication helpers
  controllers/   HTTP routes only
  services/      business rules
  repositories/  SQL/persistence boundaries
  storage/       schema and seed
  tests/         requirement-based tests
frontend/
  src/           editable TypeScript UI
  public/        compiled browser output + CSS

docs/            walkthrough, guide, contracts, traceability, verification

data/            generated SQLite database
uploads/         generated demo artifacts
```

## Course-MVP limitations

The package is intentionally not a production deployment. Production work would still include HTTPS termination, managed secrets, production malware scanning/object storage, stronger monitoring/backups, and database/infrastructure changes if real load requires them. Team finder, waitlist, and submission version history also remain outside the D2 MVP because D1 placed them in later work.
