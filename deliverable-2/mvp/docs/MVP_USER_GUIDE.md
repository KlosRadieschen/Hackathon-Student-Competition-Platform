# MVP user guide

## 1. Organizer — create and configure a challenge

1. Log in with `organizer@example.com` / `Pass123!`.
2. Use **Create challenge**.
3. Enter title, description, rules, minimum/maximum team size, an optional maximum number of teams, registration deadline, and submission deadline.
4. Save the challenge.
5. The new challenge appears in Challenge management.
6. While status is `open`, edit the same fields and save changes when needed.
7. Configure the evaluation rubric. Add/remove criteria and keep weights at exactly 100%.

The seeded challenge is only starter demo data; organizer-created challenges are fully supported.

## 2. Participant — team, challenge search, registration, submission

1. Log in with `participant@example.com` / `Pass123!`, or choose **Create an account** on the login page to sign up as a new participant.
2. Create a team, or use `participant2@example.com` to demonstrate joining through the invite code. **Leave team** removes you from the team (refused if it would take a registered team below its minimum size).
3. Use the Search box to find a challenge by title, description, or rules. A full challenge says so instead of showing **Register team**. Teammates can join with the invite code or by opening the invite link shown on the team card.
4. Read the configured rules/team-size/deadline information.
5. Register the team.
6. Enter a description and a repository link and/or a file.
7. Files may be PDF/ZIP/TXT/MD (prototype maximum 1 MB); they are scanned, and a file whose content does not match its extension is rejected.
8. Submit.
9. Confirm that a **Timestamped receipt** appears.
10. Before judging starts, update the submission if needed. Each update becomes the new version; earlier versions appear under **Previous versions**.

## 3. Organizer — assign judge and start judging

1. Return to the organizer dashboard.
2. Review the registered teams on each challenge card and the submitted projects.
3. Assign a judge.
4. Click **Start judging** only when submissions are ready.
5. Confirm the warning: this closes submissions and locks challenge/rubric configuration.

## 4. Judge — no-conflict evaluation path

1. Log in with `judge@example.com` / `Pass123!`.
2. Initially see only team/challenge identity.
3. Choose **No conflict — continue**.
4. Open the project and rubric.
5. Score every criterion within its configured maximum.
6. Add written feedback.
7. Submit evaluation.

The displayed total is a **D2 MVP provisional weighted total**, not a permanently fixed final competition formula.

## 5. Judge — conflict/reassignment path

1. Before opening project content, choose **Declare conflict**.
2. Enter a short reason.
3. The assignment becomes inactive and evaluation is blocked.
4. The organizer dashboard shows a **Needs reassignment** alert for the project; the audit log shows `CONFLICT_DECLARED` and `JUDGE_REASSIGNMENT_REQUIRED`. The conflicted judge cannot be assigned to it again.
5. Organizer assigns `judge2@example.com`.
6. Judge 2 performs their own conflict check and can evaluate if there is no conflict.

## 6. Organizer — ranking and publication

1. After every submitted project has at least one evaluation, return to the organizer dashboard.
2. The provisional ranking shows team, score, and evaluation count.
3. The MVP formula is the average of judge provisional weighted totals.
4. Click **Publish results**.
5. Publication is logged.

## 7. Participant — published result

1. Log in again as the participant.
2. The Published results section appears only after organizer publication.
3. It shows rank, provisional score, and written judge feedback.
4. Judge names are not exposed in the participant result view.

## 8. Admin — accounts, failed uploads, backups

1. Log in with `admin@example.com` / `Pass123!`.
2. **Accounts:** pick a new role and click **Save role**, or click **Reset password** and hand the temporary password to the user privately.
3. **Failed uploads:** each failed submission attempt shows the time, user, registration, error code, and file. Use it to tell a team exactly what went wrong.
4. **Backups:** shows automatic daily backups; **Back up now** takes one immediately.
5. The organizer tools appear below the admin section.

## Clean restart

Stop the server with `Ctrl+C`, then run:

```bash
npm run reset
npm start
```
