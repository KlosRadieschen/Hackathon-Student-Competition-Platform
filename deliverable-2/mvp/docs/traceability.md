# Deliverable 1 → complete D2 MVP traceability

| D1 source / feedback | Complete D2 MVP implementation |
|---|---|
| Project scope: organizers publish challenges/deadlines; rules/team sizes/evaluation criteria are configurable | Organizer can create/edit challenge title, description, rules, min/max team size, registration/submission deadlines, and rubric criteria. |
| FR1 / MVP login | Seeded email/password authentication for participant, organizer, judge, and admin roles. |
| FR2 role-based access | Server-side role checks protect organizer, participant, judge, and admin operations. |
| FR3 create/edit/search challenges | Organizer Create/Edit Challenge UI; participant Search box across title/description/rules. |
| FR4 set/extend deadlines | Organizer challenge edit form updates both deadlines; extensions and overrides are audited. |
| FR5 create/join team | Team create + invite-code join implemented. Team leave remains outside the selected D2 flow. |
| FR6 / UC2 register for challenge | Registration service checks open registration, team size, duplicate registration, and one-challenge-per-team assumption. |
| FR7 / UC1 submit/update | One active timestamped submission per registration; update allowed before deadline; version history not retained. |
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
| Teacher feedback: MVP/version-history inconsistency | One active submission only; version history remains future work. |
