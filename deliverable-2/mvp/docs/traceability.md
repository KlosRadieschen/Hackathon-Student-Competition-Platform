# Deliverable 1 → complete D2 MVP traceability

| D1 source / feedback | Complete D2 MVP implementation |
|---|---|
| Project scope: organizers publish challenges/deadlines; rules/team sizes/evaluation criteria are configurable | Organizer can create/edit challenge title, description, rules, min/max team size, registration/submission deadlines, and rubric criteria. |
| FR1 register and log in | Participant self-service sign-up (password rules, unique email) plus email/password login for every role. Other roles are granted by an admin. |
| FR2 role-based access | Server-side role checks protect organizer, participant, judge, and admin operations. |
| FR3 create/edit/search challenges | Organizer Create/Edit Challenge UI and organizer search box; participant search box across title/description/rules. |
| FR4 set/extend deadlines | Organizer challenge edit form updates both deadlines; extensions and overrides are audited. |
| FR5 create/join/leave team | Team create, invite-code joining, and leaving. Ownership passes to another member; an empty unregistered team is deleted. A registered team cannot exceed its maximum or drop below its minimum, and membership locks once submissions close. |
| FR6 / UC2 register for challenge | Registration service checks open registration, team size, duplicate registration, and one-challenge-per-team assumption. |
| FR7 / UC1 submit/update | One active timestamped submission per registration; update allowed before deadline. UC1 required fields enforced: a description plus a repository link or file. |
| UC1 extension 3a/3b | The deadline error shows the deadline time; file errors name the failing file; the form keeps the other data. |
| UC1 extension 4a | Each update becomes the new active version and the previous version (with its file) is kept in `submission_versions`; the participant sees the history. |
| UC2 step 3 "challenge not full" | Optional `maxTeams` per challenge; registration refused with `CHALLENGE_FULL` (the waitlist in extension 3b stays Release 1). |
| UC2 step 5 | Each organizer challenge card lists the registered teams with size, registration time, and submission version. |
| UC3 extension 2a "organizer notified to reassign" | Dashboard banner and **Needs reassignment** badge on the submission; the conflicted judge cannot be reassigned to it. |
| FR5 invite via code/link | Invite code and invite link `/?invite=CODE`, which pre-fills the join form. |
| NFR2 performance | `npm run load-test`: 200 teams in a 10 s deadline rush, p95 29 ms; 200 simultaneous re-submissions, none lost. See PERFORMANCE.md. |
| NFR4 usability | `npm run mobile-check`: every dashboard fits a 390 px phone screen. The 5-minute join-and-register goal is measured with real users using USABILITY_CHECK.md. |
| NFR1 uploaded files scanned | Every artifact is checked for the EICAR malware test signature and for content that does not match its extension; ClamAV also scans it when installed. |
| NFR3 daily backups | Automatic backup of the database and artifacts at startup (if older than 24 h) and every 24 h; newest 14 kept; admin can back up on demand. |
| Admin story 1: change roles, reset accounts | Admin dashboard changes roles (not their own; not for participants still in a team) and resets accounts to a one-off temporary password. Both are audited. |
| Admin story 2: error logs for failed uploads | Every failed submission/upload attempt is stored as `UPLOAD_FAILED` with error code, message, user, registration, file name, and size, and shown on the admin dashboard. |
| Admin story 3: automated backups | See NFR3 above. |
| Teacher feedback: conflict appeared too late / Release 1 | Conflict is MVP behavior before project content is exposed. No-conflict confirmation is required before evaluation data/artifact access. |
| Teacher feedback: conflict not represented | `conflicts` table, assignment status, and conflict-check timestamp persist the workflow. |
| FR8 judge assignment + conflict | Organizer assigns/reassigns judges; conflict deactivates assignment; a second demo judge allows real reassignment. |
| FR9 configurable rubric + feedback | Organizer edits `evaluation_criteria`; judge creates `criterion_scores`; written feedback is mandatory. |
| D1 final score formula was open | MVP uses clearly-labelled provisional weighted totals; ranking uses average judge weighted totals and remains replaceable. |
| FR10 aggregate ranking + publish | Organizer sees provisional ranking and can publish only after every submitted project has at least one evaluation. |
| Participant story: view score/feedback after publication | Published results section shows rank, provisional score, and written feedback without judge names. |
| University fairness | Central authorization, deadline checks, stable rubric during judging, conflict-first workflow, audit trail. |
| University low cost | One Node.js modular monolith + SQLite for course MVP. |
| University reusability | Challenges, deadlines, team-size limits, and rubric criteria are configurable data. |
| Teacher feedback: Logging was vague | Explicit audit events for authentication and competition actions, including challenge changes, deadline changes, submissions, judge assignment/reassignment, conflicts, evaluations, and publication. |
| Authentication vs activity logging | Authentication verifies identity/role; audit log records important actions separately. |
| Teacher feedback: MVP/version-history inconsistency | Resolved by implementing UC1 extension 4a: one active submission plus a kept history of earlier versions. |
