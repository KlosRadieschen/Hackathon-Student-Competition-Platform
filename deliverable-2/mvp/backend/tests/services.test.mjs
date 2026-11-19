// Use Node's built-in test runner so the MVP needs no external test framework.
import test from 'node:test';
// Use strict assertions so accidental type/coercion differences are visible.
import assert from 'node:assert/strict';
// Import the real database/schema code; tests use an in-memory database.
import { openDatabase } from '../storage/database.mjs';
// Import the same seed data used by the running MVP.
import { seedDatabase } from '../storage/seed.mjs';
// Import repositories exactly as the application wires them.
import { createUserRepository } from '../repositories/userRepository.mjs';
import { createChallengeRepository } from '../repositories/challengeRepository.mjs';
import { createTeamRepository } from '../repositories/teamRepository.mjs';
import { createRegistrationRepository } from '../repositories/registrationRepository.mjs';
import { createSubmissionRepository } from '../repositories/submissionRepository.mjs';
import { createEvaluationRepository } from '../repositories/evaluationRepository.mjs';
import { createAuditRepository } from '../repositories/auditRepository.mjs';
import { createResultRepository } from '../repositories/resultRepository.mjs';
// Import the business services under test.
import { createTeamService } from '../services/teamService.mjs';
import { createRegistrationService } from '../services/registrationService.mjs';
import { createSubmissionService } from '../services/submissionService.mjs';
import { createOrganizerService } from '../services/organizerService.mjs';
import { createEvaluationService } from '../services/evaluationService.mjs';
import { createAuthService } from '../services/authService.mjs';
import { createResultService } from '../services/resultService.mjs';

// Build one fully wired in-memory application fixture per test.
function fixture() {
  // In-memory SQLite makes each test isolated and fast.
  const db = openDatabase(':memory:');
  // Seed the same demo users/challenge/rubric as the real MVP.
  seedDatabase(db);

  // Create repository boundaries over the test database.
  const users = createUserRepository(db);
  const challenges = createChallengeRepository(db);
  const teams = createTeamRepository(db);
  const registrations = createRegistrationRepository(db);
  const submissions = createSubmissionRepository(db);
  const evaluations = createEvaluationRepository(db);
  const audit = createAuditRepository(db);
  const results = createResultRepository(db);

  // Return repositories plus fully wired services to each test.
  return {
    db,
    users,
    challenges,
    teams,
    registrations,
    submissions,
    evaluations,
    audit,
    results,
    auth:createAuthService(users,audit),
    team:createTeamService(teams,audit),
    registration:createRegistrationService(challenges,teams,registrations,audit),
    submission:createSubmissionService(challenges,teams,registrations,submissions,audit),
    organizer:createOrganizerService(challenges,submissions,users,evaluations,results,audit),
    evaluation:createEvaluationService(challenges,submissions,evaluations,audit),
    result:createResultService(challenges,teams,results)
  };
}

// Resolve seeded ids by stable email instead of assuming auto-increment values.
function participantId(f){ return f.users.findByEmail('participant@example.com').id; }
function judgeId(f){ return f.users.findByEmail('judge@example.com').id; }
function secondJudgeId(f){ return f.users.findByEmail('judge2@example.com').id; }
function organizerId(f){ return f.users.findByEmail('organizer@example.com').id; }

// Build the common participant -> register -> submit -> judging -> assigned-judge state.
function setupSubmitted(f) {
  const participant = participantId(f);
  f.team.createTeam(participant,'Alpha Team');
  const registration = f.registration.register(participant,1);
  const submission = f.submission.submit(participant,registration.registrationId,{
    repositoryLink:'https://github.com/example/project',
    description:'Demo project'
  });
  f.organizer.startJudging(organizerId(f),1);
  f.organizer.assignJudge(organizerId(f),submission.submissionId,judgeId(f));
  return submission.submissionId;
}

// Authentication is part of every role-based flow, so verify valid and invalid credentials.
test('authentication accepts seeded credentials and rejects wrong password',()=>{
  const f=fixture();
  const ok=f.auth.login('participant@example.com','Pass123!');
  assert.equal(ok.user.role,'participant');
  assert.throws(()=>f.auth.login('participant@example.com','wrong'),error=>error.code==='INVALID_CREDENTIALS');
  f.db.close();
});

// UC2 must enforce organizer-configured team-size limits.
test('registration enforces configured team size',()=>{
  const f=fixture();
  const participant=participantId(f);
  f.team.createTeam(participant,'Solo Team');
  f.db.prepare('UPDATE challenges SET min_team_size=2 WHERE id=1').run();
  assert.throws(()=>f.registration.register(participant,1),error=>error.code==='TEAM_SIZE_INVALID');
  f.db.close();
});

// D1 assumes one challenge per team; the MVP explicitly enforces it.
test('a team can register for only one challenge in the MVP',()=>{
  const f=fixture();
  const participant=participantId(f);
  f.team.createTeam(participant,'One Challenge Team');
  f.registration.register(participant,1);

  const now=Date.now();
  const second=f.db.prepare(`
    INSERT INTO challenges(title,description,min_team_size,max_team_size,registration_deadline,submission_deadline,status)
    VALUES(?,?,?,?,?,?,?)
  `).run(
    'Second Challenge',
    'Another challenge',
    1,
    4,
    new Date(now+86400000).toISOString(),
    new Date(now+172800000).toISOString(),
    'open'
  );

  assert.throws(
    ()=>f.registration.register(participant,Number(second.lastInsertRowid)),
    error=>error.code==='TEAM_ALREADY_REGISTERED'
  );
  f.db.close();
});

// UC1 must lock project submission after the configured deadline.
test('submission is rejected after the deadline',()=>{
  const f=fixture();
  const participant=participantId(f);
  f.team.createTeam(participant,'Deadline Team');
  const registration=f.registration.register(participant,1);
  f.db.prepare("UPDATE challenges SET submission_deadline='2020-01-01T00:00:00.000Z' WHERE id=1").run();
  assert.throws(
    ()=>f.submission.submit(participant,registration.registrationId,{repositoryLink:'https://example.com'}),
    error=>error.code==='SUBMISSION_CLOSED'
  );
  f.db.close();
});


// UC1 update semantics keep one active submission and preserve an existing artifact when no replacement file is supplied.
test('updating the active submission preserves the existing artifact unless a new file replaces it',()=>{
  const f=fixture();
  const participant=participantId(f);
  f.team.createTeam(participant,'Update Team');
  const registration=f.registration.register(participant,1);

  const first=f.submission.submit(participant,registration.registrationId,{
    repositoryLink:'https://github.com/example/first',
    description:'First version',
    artifact:{
      name:'demo.txt',
      type:'text/plain',
      dataBase64:Buffer.from('demo artifact').toString('base64')
    }
  });

  const second=f.submission.submit(participant,registration.registrationId,{
    repositoryLink:'https://github.com/example/updated',
    description:'Updated description'
  });

  assert.equal(second.submissionId,first.submissionId);
  assert.ok(second.submittedAt);
  const stored=f.submissions.findByRegistration(registration.registrationId);
  assert.equal(stored.artifact_name,'demo.txt');
  assert.equal(stored.description,'Updated description');
  f.db.close();
});

// The teacher's D1 feedback requires conflict checking before project evaluation begins.
test('project details remain hidden until the judge completes the conflict check',()=>{
  const f=fixture();
  const submissionId=setupSubmitted(f);
  const judge=judgeId(f);

  // Before confirmation, the assignment list contains identity but not project-content fields.
  const assignment=f.evaluation.listAssignments(judge)[0];
  assert.equal(assignment.teamName,'Alpha Team');
  assert.equal(Object.prototype.hasOwnProperty.call(assignment,'repositoryLink'),false);

  // Full evaluation data is blocked until no-conflict is explicitly confirmed.
  assert.throws(
    ()=>f.evaluation.loadData(judge,submissionId),
    error=>error.code==='CONFLICT_CHECK_REQUIRED'
  );

  // After explicit confirmation, the project content and rubric can be opened.
  f.evaluation.confirmNoConflict(judge,submissionId);
  const data=f.evaluation.loadData(judge,submissionId);
  assert.equal(data.submission.repositoryLink,'https://github.com/example/project');
  assert.ok(data.criteria.length >= 1);
  f.db.close();
});

// A declared conflict must block evaluation and create a traceable reassignment requirement.
test('declared conflict blocks evaluation and records reassignment requirement',()=>{
  const f=fixture();
  const submissionId=setupSubmitted(f);
  const judge=judgeId(f);
  const conflict=f.evaluation.declareConflict(judge,submissionId,'I know a team member');
  assert.equal(conflict.reassignmentRequired,true);
  assert.throws(
    ()=>f.evaluation.submit(judge,submissionId,{feedback:'Good',scores:[]}),
    error=>error.code==='NOT_ASSIGNED' || error.code==='CONFLICT_DECLARED'
  );
  const events=f.audit.list(20).map((event)=>event.eventType);
  assert.ok(events.includes('CONFLICT_DECLARED'));
  assert.ok(events.includes('JUDGE_REASSIGNMENT_REQUIRED'));

  // The organizer can complete the conflict branch by assigning a different judge.
  const replacementJudge=secondJudgeId(f);
  f.organizer.assignJudge(organizerId(f),submissionId,replacementJudge);
  f.evaluation.confirmNoConflict(replacementJudge,submissionId);
  const replacementData=f.evaluation.loadData(replacementJudge,submissionId);
  assert.equal(replacementData.submission.teamName,'Alpha Team');
  f.db.close();
});

// FR9 says the rubric is configurable, so verify organizer edits are real persisted behavior.
test('organizer can edit the rubric before judging and weights must total 100 percent',()=>{
  const f=fixture();
  const organizer=organizerId(f);

  const updated=f.organizer.updateRubric(organizer,1,[
    {name:'Technical Quality',description:'Implementation quality',weightPercent:50,maxScore:20},
    {name:'Innovation',description:'Originality',weightPercent:25,maxScore:10},
    {name:'Impact',description:'Value to users',weightPercent:25,maxScore:5}
  ]);

  assert.equal(updated.criteria.length,3);
  assert.equal(updated.criteria[0].weightPercent,50);
  assert.equal(updated.criteria[0].maxScore,20);

  assert.throws(
    ()=>f.organizer.updateRubric(organizer,1,[
      {name:'A',description:'',weightPercent:40,maxScore:10},
      {name:'B',description:'',weightPercent:40,maxScore:10}
    ]),
    error=>error.code==='RUBRIC_WEIGHT_TOTAL'
  );

  f.db.close();
});

// Rubrics must be stable during judging so different judges are not given different criteria.
test('rubric editing is locked after judging starts',()=>{
  const f=fixture();
  const organizer=organizerId(f);
  f.organizer.startJudging(organizer,1);
  assert.throws(
    ()=>f.organizer.updateRubric(organizer,1,[
      {name:'Only Criterion',description:'',weightPercent:100,maxScore:10}
    ]),
    error=>error.code==='RUBRIC_LOCKED'
  );
  f.db.close();
});

// Complete UC3 evaluation should use the current configurable rubric and produce the MVP weighted total.
test('complete rubric evaluation calculates the provisional weighted total',()=>{
  const f=fixture();
  const submissionId=setupSubmitted(f);
  const judge=judgeId(f);

  // Explicitly clear conflict before accessing evaluation data, matching the corrected workflow.
  f.evaluation.confirmNoConflict(judge,submissionId);
  const data=f.evaluation.loadData(judge,submissionId);
  const byName=Object.fromEntries(data.criteria.map((criterion)=>[criterion.name,criterion]));

  const result=f.evaluation.submit(judge,submissionId,{
    feedback:'Strong implementation with clear impact.',
    scores:[
      {criterionId:byName['Technical Quality'].id,score:10},
      {criterionId:byName['Innovation'].id,score:8},
      {criterionId:byName['Impact'].id,score:6}
    ]
  });

  assert.equal(result.totalScore,82);
  assert.equal(result.scoreMeaning,'D2 MVP provisional weighted total');
  f.db.close();
});

// D1 FR3/FR4 require organizers to create/edit challenges, rules, team sizes, and deadlines.
test('organizer can create and edit an open challenge and deadline changes are audited',()=>{
  const f=fixture();
  const organizer=organizerId(f);
  const now=Date.now();

  const created=f.organizer.createChallenge(organizer,{
    title:'AI for Campus',
    description:'Build a useful campus AI prototype.',
    rules:'Teams must submit one working prototype.',
    minTeamSize:2,
    maxTeamSize:5,
    registrationDeadline:new Date(now+2*86400000).toISOString(),
    submissionDeadline:new Date(now+5*86400000).toISOString()
  });

  const stored=f.challenges.findById(created.challengeId);
  assert.equal(stored.title,'AI for Campus');
  assert.equal(Number(stored.organizer_id),Number(organizer));
  assert.equal(stored.rules,'Teams must submit one working prototype.');

  f.organizer.updateChallenge(organizer,created.challengeId,{
    title:'AI for Campus 2026',
    description:'Build a useful campus AI prototype for university life.',
    rules:'Teams must submit one working prototype and repository link.',
    minTeamSize:2,
    maxTeamSize:6,
    registrationDeadline:new Date(now+3*86400000).toISOString(),
    submissionDeadline:new Date(now+6*86400000).toISOString()
  });

  const updated=f.challenges.findById(created.challengeId);
  assert.equal(updated.title,'AI for Campus 2026');
  assert.equal(Number(updated.max_team_size),6);

  const events=f.audit.list(50).map((event)=>event.eventType);
  assert.ok(events.includes('CHALLENGE_CREATED'));
  assert.ok(events.includes('CHALLENGE_UPDATED'));
  assert.ok(events.includes('REGISTRATION_DEADLINE_EXTENDED'));
  assert.ok(events.includes('SUBMISSION_DEADLINE_EXTENDED'));
  f.db.close();
});

// D1's end-to-end MVP includes ranking/publication and participant feedback after publication.
test('evaluated submissions can be ranked, published, and viewed by the participant',()=>{
  const f=fixture();
  const submissionId=setupSubmitted(f);
  const judge=judgeId(f);
  const organizer=organizerId(f);
  const participant=participantId(f);

  f.evaluation.confirmNoConflict(judge,submissionId);
  const data=f.evaluation.loadData(judge,submissionId);
  const scores=data.criteria.map((criterion)=>({
    criterionId:Number(criterion.id),
    score:Number(criterion.maxScore),
    comment:'Meets the criterion.'
  }));

  f.evaluation.submit(judge,submissionId,{
    feedback:'Strong project with a complete implementation.',
    scores
  });

  const before=f.organizer.getRanking(organizer,1);
  assert.equal(before.readyToPublish,true);
  assert.equal(before.ranking.length,1);
  assert.equal(Number(before.ranking[0].position),1);

  const published=f.organizer.publishResults(organizer,1);
  assert.equal(published.status,'published');
  assert.equal(f.challenges.findById(1).status,'published');

  const visible=f.result.myResults(participant);
  assert.equal(visible.length,1);
  assert.equal(visible[0].position,1);
  assert.equal(visible[0].provisionalScore,100);
  assert.equal(visible[0].feedback[0].feedback,'Strong project with a complete implementation.');
  f.db.close();
});
