// Import the file system because authorized users may download stored submission artifacts.
import fs from 'node:fs';
// Import the JSON request/response helpers used by all API routes.
import { readJson, sendJson } from '../http/response.mjs';
// Import authentication helpers so every protected route verifies the current user and role.
import { authenticate, requireRole } from '../http/auth.mjs';

// Register every REST endpoint used by the D2 MVP.
export function registerApiRoutes(router, deps) {
  // Pull the repository/service dependencies out once so routes stay readable.
  const {
    users,
    challenges,
    audit,
    authService,
    teamService,
    registrationService,
    submissionService,
    organizerService,
    evaluationService,
    resultService,
    evaluationRepo
  } = deps;

  // ---- Authentication ----------------------------------------------------

  // Log in with email/password and receive a signed access token.
  router.add('POST', '/api/auth/login', async (req, res) => {
    const body = await readJson(req);
    sendJson(res, 200, authService.login(body.email, body.password));
  });

  // Return the currently authenticated user so the browser can restore a session.
  router.add('GET', '/api/me', async (req, res) => {
    const user = authenticate(req, users);
    sendJson(res, 200, { user });
  });

  // ---- Shared challenge data --------------------------------------------

  // List challenge information that authenticated users need for their dashboards.
  router.add('GET', '/api/challenges', async (req, res) => {
    authenticate(req, users);
    sendJson(res, 200, {
      challenges: challenges.list().map((challenge) => ({
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        rules: challenge.rules || '',
        minTeamSize: challenge.min_team_size,
        maxTeamSize: challenge.max_team_size,
        registrationDeadline: challenge.registration_deadline,
        submissionDeadline: challenge.submission_deadline,
        status: challenge.status,
        publishedAt: challenge.published_at
      }))
    });
  });

  // ---- Participant / team / registration routes -------------------------

  // Return the participant's current team, if one exists.
  router.add('GET', '/api/teams/me', async (req, res) => {
    const user = authenticate(req, users);
    requireRole(user, 'participant');
    sendJson(res, 200, { team: teamService.getMyTeam(user.id) });
  });

  // Create a team owned by the current participant.
  router.add('POST', '/api/teams', async (req, res) => {
    const user = authenticate(req, users);
    requireRole(user, 'participant');
    const body = await readJson(req);
    sendJson(res, 201, { team: teamService.createTeam(user.id, body.name) });
  });

  // Join an existing team using its invite code.
  router.add('POST', '/api/teams/join', async (req, res) => {
    const user = authenticate(req, users);
    requireRole(user, 'participant');
    const body = await readJson(req);
    sendJson(res, 200, { team: teamService.joinTeam(user.id, body.inviteCode) });
  });

  // Register the current participant's team for one challenge.
  router.add('POST', '/api/challenges/:id/register', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'participant');
    sendJson(res, 201, registrationService.register(user.id, Number(params.id)));
  });

  // Return the participant team's registrations and current active submission data.
  router.add('GET', '/api/registrations/me', async (req, res) => {
    const user = authenticate(req, users);
    requireRole(user, 'participant');
    sendJson(res, 200, { registrations: registrationService.listMine(user.id) });
  });

  // Return published ranking/feedback for the participant's team.
  router.add('GET', '/api/results/me', async (req, res) => {
    const user = authenticate(req, users);
    requireRole(user, 'participant');
    sendJson(res, 200, { results: resultService.myResults(user.id) });
  });

  // Create or update the team's single active MVP submission before the deadline.
  router.add('POST', '/api/registrations/:id/submission', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'participant');
    const body = await readJson(req);
    sendJson(res, 201, submissionService.submit(user.id, Number(params.id), body));
  });

  // ---- Organizer routes --------------------------------------------------

  // List challenges owned by the current organizer (admins see all).
  router.add('GET', '/api/organizer/challenges', async (req, res) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    sendJson(res, 200, { challenges: organizerService.listChallenges(user.id) });
  });

  // Create a new challenge with rules, team-size limits, and deadlines.
  router.add('POST', '/api/organizer/challenges', async (req, res) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    const body = await readJson(req);
    sendJson(res, 201, organizerService.createChallenge(user.id, body));
  });

  // Edit one open challenge owned by the organizer.
  router.add('PUT', '/api/organizer/challenges/:id', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    const body = await readJson(req);
    sendJson(res, 200, organizerService.updateChallenge(user.id, Number(params.id), body));
  });

  // List submitted projects so an organizer can assign judges.
  router.add('GET', '/api/organizer/submissions', async (req, res) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    sendJson(res, 200, { submissions: organizerService.listSubmissions(user.id) });
  });

  // List judge accounts available for assignment.
  router.add('GET', '/api/organizer/judges', async (req, res) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    sendJson(res, 200, { judges: organizerService.listJudges() });
  });

  // Return the current editable rubric for one challenge.
  router.add('GET', '/api/challenges/:id/rubric', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    sendJson(res, 200, organizerService.getRubric(user.id, Number(params.id)));
  });

  // Replace the organizer-configured rubric before judging starts.
  router.add('PUT', '/api/challenges/:id/rubric', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    const body = await readJson(req);
    sendJson(res, 200, organizerService.updateRubric(user.id, Number(params.id), body.criteria));
  });

  // Assign one judge to one submitted project.
  router.add('POST', '/api/submissions/:id/assign-judge', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    const body = await readJson(req);
    sendJson(res, 200, organizerService.assignJudge(user.id, Number(params.id), Number(body.judgeId)));
  });

  // Close submissions and move the challenge into judging.
  router.add('POST', '/api/challenges/:id/start-judging', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    sendJson(res, 200, organizerService.startJudging(user.id, Number(params.id)));
  });

  // Show the provisional ranking and whether all submitted projects are evaluated.
  router.add('GET', '/api/challenges/:id/ranking', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    sendJson(res, 200, organizerService.getRanking(user.id, Number(params.id)));
  });

  // Publish final MVP results after every submitted project has at least one evaluation.
  router.add('POST', '/api/challenges/:id/publish-results', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    sendJson(res, 200, organizerService.publishResults(user.id, Number(params.id)));
  });

  // ---- Judge / conflict / evaluation routes -----------------------------

  // List assignment identity only; project details remain hidden before the conflict check.
  router.add('GET', '/api/judge/assignments', async (req, res) => {
    const user = authenticate(req, users);
    requireRole(user, 'judge');
    sendJson(res, 200, { assignments: evaluationService.listAssignments(user.id) });
  });

  // Explicitly confirm that the judge has no conflict before the project is opened.
  router.add('POST', '/api/submissions/:id/no-conflict', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'judge');
    sendJson(res, 200, evaluationService.confirmNoConflict(user.id, Number(params.id)));
  });

  // Load full submission content and the configured rubric after conflict clearance.
  router.add('GET', '/api/submissions/:id/evaluation-data', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'judge');
    sendJson(res, 200, evaluationService.loadData(user.id, Number(params.id)));
  });

  // Declare a conflict and deactivate the assignment.
  router.add('POST', '/api/submissions/:id/conflicts', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'judge');
    const body = await readJson(req);
    sendJson(res, 201, evaluationService.declareConflict(user.id, Number(params.id), body.reason));
  });

  // Validate all rubric scores and written feedback, then persist the final judge evaluation.
  router.add('POST', '/api/submissions/:id/evaluations', async (req, res, params) => {
    const user = authenticate(req, users);
    requireRole(user, 'judge');
    const body = await readJson(req);
    sendJson(res, 201, evaluationService.submit(user.id, Number(params.id), body));
  });

  // ---- Artifact download -------------------------------------------------

  // Download an artifact only after the service confirms the current user may access it.
  router.add('GET', '/api/submissions/:id/artifact', async (req, res, params) => {
    const user = authenticate(req, users);
    const submission = submissionService.artifactAccess(user, Number(params.id), evaluationRepo);
    const data = fs.readFileSync(submission.artifact_path);
    res.writeHead(200, {
      'content-type': submission.artifact_mime || 'application/octet-stream',
      'content-disposition': `attachment; filename="${String(submission.artifact_name || 'artifact').replace(/"/g, '')}"`,
      'content-length': data.length,
      'cache-control': 'no-store'
    });
    res.end(data);
  });

  // ---- Audit log ---------------------------------------------------------

  // Organizers/admins can inspect the latest traceable competition events.
  router.add('GET', '/api/audit', async (req, res) => {
    const user = authenticate(req, users);
    requireRole(user, 'organizer', 'admin');
    sendJson(res, 200, { events: audit.list(100) });
  });
}
