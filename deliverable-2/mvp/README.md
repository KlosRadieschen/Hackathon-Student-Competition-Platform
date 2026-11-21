# Hackathon & Student Competition Platform — D2 MVP

This package continues directly from Deliverable 1. It implements the selected core use cases for Deliverable 2 and closes the main consistency gaps identified in the instructor feedback.

## What the MVP now supports

### Organizer
- Create a challenge with title, description, rules, minimum/maximum team size, an optional maximum number of teams, registration deadline, and submission deadline.
- Search challenges by title, description, or rules.
- Edit an open challenge and extend/change deadlines. Limits cannot be changed so that an already-registered team or the current number of registrations no longer fits.
- See every team registered for each challenge (members, registration time, latest submission version).
- Configure the evaluation rubric by adding/removing/editing criteria, weights, descriptions, and maximum scores.
- Assign or reassign judges to submitted projects. When a judge declares a conflict, the dashboard shows a **Needs reassignment** alert, and the conflicted judge cannot be assigned to that project again.
- Start the judging phase, which closes submissions and locks challenge/rubric configuration.
- View the provisional ranking after evaluations are submitted.
- Publish results after every submitted project has at least one evaluation.
- Inspect the audit log.

### Participant
- Sign up for a participant account, or log in with a demo account.
- Create a team, join one with an invite code or invite link (`/?invite=CODE`), or leave a team.
- Joining is refused when a registered team is already at its challenge's maximum size; leaving is refused when it would drop a registered team below the minimum. Membership locks once submissions close.
- Search/browse challenges.
- Read challenge description, rules, team-size limits, and deadlines.
- Register an eligible team for one challenge (refused when the team size is wrong or the challenge is full).
- Submit a description plus a repository link and/or an artifact (an empty submission is rejected).
- Update the submission before the deadline; each update becomes the new active version and the previous one is kept in **version history**.
- See a timestamped submission receipt with the version number.
- Error messages name the file that failed and show the deadline time; other form data is kept.
- After results are published, see team rank, provisional score, and written judge feedback.

### Judge
- See assigned team/challenge identity first without project details.
- Declare a conflict of interest before project content is opened.
- Or explicitly confirm no conflict and then open project details/rubric.
- Score every configured criterion and provide written feedback.
- Submit one final evaluation.

### Platform admin
- Admins see an admin dashboard above the organizer tools (admins can manage every challenge).
- List all accounts, change a user's role, and reset an account to a one-off temporary password.
- See every failed submission/upload attempt with its error code, user, registration, and file.
- See stored backups and take one on demand; backups also run automatically every 24 hours.

### Conflict reassignment
- A declared conflict deactivates that assignment.
- The audit log records `CONFLICT_DECLARED` and `JUDGE_REASSIGNMENT_REQUIRED`.
- A second seeded judge is available so the organizer can actually demonstrate reassignment.

## D1 feedback addressed

1. **Conflict of interest** is MVP behavior and happens before project content/rubric is exposed.
2. **ConflictOfInterest, EvaluationCriterion, and CriterionScore** are real persisted concepts.
3. **University concerns** are supported through fairness rules, auditability, configurable data, simple deployment, and reuse.
4. **Activity logging** is concrete and separate from authentication.
5. **Version history** is now consistent with UC1 extension 4a: one active submission, with every replaced version kept in history.
6. **Challenge creation/editing** is available to organizers rather than relying only on seed data.
7. **End-to-end publish flow** is available: evaluation → provisional ranking → organizer publication → participant results.

## Important MVP design decisions

### Provisional scoring/ranking
Deliverable 1 left the final scoring formula open. Therefore the D2 MVP makes an explicit prototype choice:

- each evaluation gets a **provisional weighted total** from organizer-defined rubric weights;
- when a project has multiple judge evaluations, the MVP ranking uses the **average of those judge weighted totals**;
- this is clearly labelled as a D2 MVP formula and can be replaced later if the team chooses another final competition formula.

### Artifact restriction and scanning
D1 requires upload type/size validation but does not define exact values. The MVP uses:
- PDF, ZIP, TXT, MD
- maximum 1 MB

These are prototype constraints, not new D1 requirements.

Every uploaded artifact is scanned before it is stored (NFR1):
- the EICAR antivirus test signature is rejected as `MALWARE_DETECTED`;
- PDF and ZIP files must start with their real file signature, and TXT/MD files must be valid UTF-8 text, so renamed executables are rejected as `FILE_CONTENT_MISMATCH`;
- when ClamAV is installed (`clamdscan` or `clamscan` on the PATH, or `CLAMSCAN_PATH`), it scans the file as well and infected files are rejected.

### Backups
The server backs up the SQLite database and the `uploads/` folder into `backups/<timestamp>/` when it starts (if the newest backup is more than 24 hours old) and every 24 hours after that. The newest 14 backups are kept (`BACKUP_KEEP`). `BACKUP_DIR` changes the location. To restore, stop the server and copy a backup's `hackathon.db` to `data/` and its `uploads/` files to `uploads/`.

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
- XSS protection: all saved text is HTML-escaped when rendered, links are limited to http(s), and a strict Content-Security-Policy blocks inline scripts
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

New participants can also use **Create an account** on the login page. Organizer, judge, and admin roles are granted by an admin.

All demo passwords are:

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
9. Submit a description plus a repository link and/or a file.
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
4. Organizer sees a **Needs reassignment** alert on the dashboard and reassignment events in the audit log.
5. Organizer assigns `judge2@example.com`.
6. Judge 2 completes their own conflict check and can evaluate normally.

## Automated tests

```bash
npm test
```

The complete suite contains **28 tests** covering:

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
12. ranking, result publication, and participant feedback visibility;
13. participant sign-up, duplicate email, and password rules;
14. maximum team size when joining a registered team, and membership lock after judging starts;
15. leaving a team: ownership transfer, empty-team deletion, registered minimum;
16. organizers cannot set team-size limits that exclude a registered team;
17. empty submissions rejected and failed attempts logged for admins;
18. upload scanning: malware test signature and disguised file content;
19. admin role changes and account resets;
20. backups of database and artifacts, and pruning of old backups;
21. HTML payloads in repository links and sign-up emails are rejected; artifact content type is set by the server;
22. challenge capacity: full challenges refuse registration; capacity cannot drop below current registrations;
23. registered teams appear in the organizer's registration list;
24. conflicted submissions are flagged for reassignment and the conflicted judge cannot be reassigned;
25. version history keeps every replaced submission and its file;
26. error messages show the deadline time and name the failing file;
27–28. the browser escaping helpers (`escapeHtml`, `safeUrl`) neutralise script payloads.

## Non-functional checks

```bash
npm run load-test      # NFR2: deadline rush + worst-case burst against a temporary server
npm run mobile-check   # NFR4: every dashboard at 390 px in headless Firefox; screenshots in docs/mobile/
```

Both start their own server on a temporary database, so they never touch `data/` or `uploads/`. Results are in `docs/PERFORMANCE.md` and `docs/USABILITY_CHECK.md`.

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
  security/      upload scanning
  controllers/   HTTP routes only
  services/      business rules
  repositories/  SQL/persistence boundaries
  storage/       schema and seed
  tests/         requirement-based tests
scripts/         load test (NFR2) and mobile check (NFR4)
frontend/
  src/           editable TypeScript UI
  public/        compiled browser output + CSS

docs/            walkthrough, guide, contracts, traceability, verification,
                 performance + usability results, architecture views (.dot + .png)

data/            generated SQLite database
uploads/         generated demo artifacts
backups/         generated database + artifact backups
```

## Course-MVP limitations

The package is intentionally not a production deployment. Production work would still include HTTPS termination, managed secrets, a mandatory production antivirus service (the built-in checks are not a full virus scanner; install ClamAV for real signature scanning), off-machine backup storage, object storage, monitoring, and database/infrastructure changes if real load requires them. The team-finder board, the waitlist for full challenges, and the repository-reachability check remain outside the D2 MVP because D1 placed them in Release 1.
