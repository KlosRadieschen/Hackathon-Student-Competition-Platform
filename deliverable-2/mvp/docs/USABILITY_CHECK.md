# NFR4 usability — mobile check and 5-minute test

> **NFR4:** A new participant can join a team and register in under 5 minutes; the platform should work on mobile devices.

## Part 1: mobile layout (automated)

```bash
npm run mobile-check
```

The script starts a temporary server with a complete demo competition. It then opens every dashboard in headless Firefox at a phone-sized 390 × 844 screen, checks that nothing is wider than the screen, and saves full-page screenshots to `docs/mobile/`.

| Screen | Page width at 390 px | Fits without horizontal scrolling |
|---|---|---|
| Login / sign-up | 378 px | Yes |
| Participant dashboard (team, invite link, challenge, version history) | 378 px | Yes |
| Organizer dashboard (create form, registered teams, rubric, submissions, audit log) | 378 px | Yes |
| Judge conflict check | 390 px | Yes |
| Judge evaluation form | 378 px | Yes |
| Admin dashboard (accounts, failed uploads, backups) | 378 px | Yes |

Wide tables (audit log, accounts, rankings) scroll inside their own box rather than widening the page.

## Part 2: join and register in under 5 minutes (manual)

Timing a real person is the only honest way to check this goal, so it is not automated. Run it with at least three people who have not used the platform before, ideally on their own phones.

**Setup:** `npm run reset && npm start`. Log in as `participant@example.com`, create a team, and copy the invite link from the team card. Log out. To test on a phone on the same Wi-Fi, start the server with `HOST=0.0.0.0 npm start` and replace `127.0.0.1` in the invite link with the laptop's network address.

**Task given to the tester (read aloud, no other help):**
"You've been invited to a hackathon team. Open this link, create an account, join the team, and register the team for the Sustainable Campus Hackathon."

Start the timer when the tester opens the link. Stop it when the challenge card shows **Registered**.

The demo challenge requires one to four members, and the invite link pre-fills the join form, so the expected path is:
open link → **Create an account** → fill in three fields → **Join** → **Register team** (5 actions).

### Results

| Tester | Device | Time (mm:ss) | Under 5 min? | Where they hesitated |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

NFR4 is met if every tester finishes in under 5 minutes. Record any hesitation points as usability issues for Release 1.
