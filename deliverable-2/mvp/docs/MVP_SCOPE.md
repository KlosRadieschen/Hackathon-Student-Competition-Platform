# D2 MVP scope — included vs future work

## Included in the complete D2 MVP

- Participant self-service sign-up and email/password login
- Role-based participant / organizer / judge / admin access
- Organizer create/edit challenge
- Configurable challenge title, description, rules, team-size limits, registration deadline, submission deadline
- Participant and organizer challenge search
- Optional challenge capacity (maximum number of teams); full challenges refuse registration
- Organizer list of registered teams per challenge
- Team creation, invite-code joining, and leaving a team
- Team-size limits enforced on registration, joining, leaving, and organizer edits
- One challenge per team assumption
- Team-size eligibility check
- Project description plus repository link and/or artifact (empty submissions rejected)
- Upload scanning: malware test signature, file-content checks, ClamAV when installed
- One active submission, editable before deadline, with version history of every replaced submission
- Invite link that pre-fills the join form
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
- Platform-admin dashboard: role changes, account resets, failed-upload log, backups
- Automatic daily backups of database and artifacts, plus on-demand backups
- Automated requirement-based tests

## Intentionally outside D2 MVP

These remain outside the selected D2 scope rather than being silently treated as missing bugs:

- team-finder board
- waitlist when a challenge is full (capacity itself is enforced)
- repository-reachability check
- a mandatory production antivirus service and object storage (ClamAV is used only when installed)
- production notification/email infrastructure
- production monitoring, off-machine backup storage, and HTTPS deployment
- a permanently fixed final ranking/normalization policy beyond the clearly-labelled MVP formula

The reason for this boundary is the D2 instruction: implement selected essential/core use cases consistently with the architecture; the MVP does not need every planned final-system feature.
