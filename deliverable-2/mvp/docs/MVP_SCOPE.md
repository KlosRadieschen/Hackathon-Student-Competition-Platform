# D2 MVP scope — included vs future work

## Included in the complete D2 MVP

- Email/password login for seeded classroom accounts
- Role-based participant / organizer / judge / admin access
- Organizer create/edit challenge
- Configurable challenge title, description, rules, team-size limits, registration deadline, submission deadline
- Participant challenge search
- Team creation and invite-code joining
- One challenge per team assumption
- Team-size eligibility check
- Project repository link, description, optional artifact
- One active submission, editable before deadline
- Timestamped submission receipt
- Organizer-configurable rubric
- Judge assignment and reassignment
- Conflict-of-interest check before project content is opened
- Conflict declaration and reassignment-required audit event
- Second demo judge for real reassignment demonstration
- Criterion-level scoring and written feedback
- D2 MVP provisional weighted total
- Provisional ranking (average judge weighted totals)
- Organizer publish-results action
- Participant rank/score/feedback after publication
- Audit log for important competition actions
- Automated requirement-based tests

## Intentionally outside D2 MVP

These remain outside the selected D2 scope rather than being silently treated as missing bugs:

- self-service public user registration/signup (seeded accounts are used for the classroom MVP)
- participant leave-team operation
- team-finder board
- challenge-capacity waitlist
- submission version history
- production antivirus/malware scanning and object storage
- production notification/email infrastructure
- production monitoring/backups/HTTPS deployment
- a permanently fixed final ranking/normalization policy beyond the clearly-labelled MVP formula
- full platform-admin account-management UI

The reason for this boundary is the D2 instruction: implement selected essential/core use cases consistently with the architecture; the MVP does not need every planned final-system feature.
