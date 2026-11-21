// Use Node's built-in test runner so the MVP needs no external test framework.
import test from 'node:test';
// Use strict assertions so accidental type/coercion differences are visible.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
import { createBackupService } from '../services/backupService.mjs';
import { createAdminService } from '../services/adminService.mjs';

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
  // Backups go to a throwaway directory so tests never touch the real backups folder.
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hackathon-backups-'));
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hackathon-uploads-'));
  const backups = createBackupService(db, audit, { backupDir, uploadDir, keep: 2 });

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
    backups,
    backupDir,
    uploadDir,
    auth:createAuthService(users,audit),
    team:createTeamService(teams,audit,registrations,challenges),
    registration:createRegistrationService(challenges,teams,registrations,audit,submissions),
    submission:createSubmissionService(challenges,teams,registrations,submissions,audit),
    organizer:createOrganizerService(challenges,submissions,users,evaluations,results,audit),
    evaluation:createEvaluationService(challenges,submissions,evaluations,audit),
    result:createResultService(challenges,teams,results),
    admin:createAdminService(users,teams,audit,backups)
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

// Create an extra participant account through the real sign-up flow.
function signUp(f,email){ return f.auth.register('Extra Participant',email,'Passw0rd!').user.id; }

// FR1: users can create their own participant account; weak or duplicate sign-ups are refused.
test('sign-up creates a participant account and rejects duplicates and weak passwords',()=>{
  const f=fixture();
  const created=f.auth.register('New Student','new@example.com','Secret123');
  assert.equal(created.user.role,'participant');
  assert.ok(created.token);
  assert.equal(f.auth.login('new@example.com','Secret123').user.id,created.user.id);
  assert.throws(()=>f.auth.register('Again','NEW@example.com','Secret123'),error=>error.code==='EMAIL_TAKEN');
  assert.throws(()=>f.auth.register('Weak','weak@example.com','short'),error=>error.code==='WEAK_PASSWORD');
  assert.throws(()=>f.auth.register('Bad','not-an-email','Secret123'),error=>error.code==='INVALID_EMAIL');
  f.db.close();
});

// A registered team must stay within its challenge's maximum size, and membership locks once judging starts.
test('joining a registered team respects the maximum size and locks after judging starts',()=>{
  const f=fixture();
  const owner=participantId(f);
  f.db.prepare('UPDATE challenges SET max_team_size=2 WHERE id=1').run();
  const team=f.team.createTeam(owner,'Full Team');
  f.team.joinTeam(f.users.findByEmail('participant2@example.com').id,team.inviteCode);
  f.registration.register(owner,1);

  const third=signUp(f,'third@example.com');
  assert.throws(()=>f.team.joinTeam(third,team.inviteCode),error=>error.code==='TEAM_FULL');
  assert.equal(f.teams.size(team.id),2);

  f.db.prepare('UPDATE challenges SET max_team_size=4 WHERE id=1').run();
  f.organizer.startJudging(organizerId(f),1);
  assert.throws(()=>f.team.joinTeam(third,team.inviteCode),error=>error.code==='TEAM_LOCKED');
  f.db.close();
});

// FR5: participants can leave a team; ownership moves on, empty teams disappear, registered minimums hold.
test('leaving a team transfers ownership, deletes empty teams, and respects the registered minimum',()=>{
  const f=fixture();
  const owner=participantId(f);
  const second=f.users.findByEmail('participant2@example.com').id;
  const team=f.team.createTeam(owner,'Leaving Team');
  f.team.joinTeam(second,team.inviteCode);

  const left=f.team.leaveTeam(owner);
  assert.equal(left.teamDeleted,false);
  assert.equal(left.ownerUserId,Number(second));
  assert.equal(f.team.getMyTeam(owner),null);

  f.db.prepare('UPDATE challenges SET min_team_size=1 WHERE id=1').run();
  f.registration.register(second,1);
  assert.throws(()=>f.team.leaveTeam(second),error=>error.code==='TEAM_SIZE_INVALID');

  const solo=f.team.createTeam(owner,'Solo Team');
  assert.equal(f.team.leaveTeam(owner).teamDeleted,true);
  assert.equal(f.teams.findByInviteCode(solo.inviteCode),null);
  assert.ok(f.audit.list(20).some((event)=>event.eventType==='TEAM_LEFT'));
  f.db.close();
});

// Organizers cannot change team-size limits in a way that silently invalidates registered teams.
test('organizer cannot set team-size limits that exclude a registered team',()=>{
  const f=fixture();
  const owner=participantId(f);
  const team=f.team.createTeam(owner,'Pair Team');
  f.team.joinTeam(f.users.findByEmail('participant2@example.com').id,team.inviteCode);
  f.registration.register(owner,1);
  const challenge=f.challenges.findById(1);
  assert.throws(()=>f.organizer.updateChallenge(organizerId(f),1,{
    title:challenge.title,
    description:challenge.description,
    rules:challenge.rules,
    minTeamSize:1,
    maxTeamSize:1,
    registrationDeadline:challenge.registration_deadline,
    submissionDeadline:challenge.submission_deadline
  }),error=>error.code==='TEAM_SIZE_CONFLICT');
  f.db.close();
});

// UC1 required fields: a description plus a link or file; failed attempts are logged for the admin.
test('empty submissions are rejected and every failed attempt is logged',()=>{
  const f=fixture();
  const participant=participantId(f);
  f.team.createTeam(participant,'Empty Team');
  const registration=f.registration.register(participant,1);

  assert.throws(()=>f.submission.submit(participant,registration.registrationId,{}),error=>error.code==='SUBMISSION_DESCRIPTION_REQUIRED');
  assert.throws(
    ()=>f.submission.submit(participant,registration.registrationId,{description:'Only a description'}),
    error=>error.code==='SUBMISSION_CONTENT_REQUIRED'
  );
  assert.throws(
    ()=>f.submission.submit(participant,registration.registrationId,{
      description:'Wrong file type',
      artifact:{name:'tool.exe',dataBase64:Buffer.from('x').toString('base64')}
    }),
    error=>error.code==='INVALID_FILE_TYPE'
  );

  const failures=f.admin.uploadErrors();
  assert.deepEqual(failures.map((event)=>event.details.code),['INVALID_FILE_TYPE','SUBMISSION_CONTENT_REQUIRED','SUBMISSION_DESCRIPTION_REQUIRED']);
  assert.equal(failures[0].details.artifactName,'tool.exe');
  assert.equal(failures[0].userEmail,'participant@example.com');
  f.db.close();
});

// NFR1: uploads are scanned for malware signatures and for content that does not match the extension.
test('upload scanning rejects malware test files and disguised content',()=>{
  const f=fixture();
  const participant=participantId(f);
  f.team.createTeam(participant,'Scan Team');
  const registration=f.registration.register(participant,1);
  const upload=(name,content)=>()=>f.submission.submit(participant,registration.registrationId,{
    description:'Scanned upload',
    artifact:{name,dataBase64:Buffer.from(content).toString('base64')}
  });

  const eicar=['X5O!P%@AP[4\\PZX54(P^)7CC)7}$','EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
  assert.throws(upload('readme.txt',eicar),error=>error.code==='MALWARE_DETECTED');
  assert.throws(upload('report.pdf',Buffer.from([0x4d,0x5a,0x90,0x00])),error=>error.code==='FILE_CONTENT_MISMATCH');
  assert.throws(upload('notes.md',Buffer.from([0x7f,0x45,0x4c,0x46,0x00])),error=>error.code==='FILE_CONTENT_MISMATCH');
  assert.equal(f.submissions.findByRegistration(registration.registrationId),null);
  f.db.close();
});

// Admin story 1: change roles and reset accounts to fix access problems.
test('admin can change roles and reset an account but not change their own role',()=>{
  const f=fixture();
  const admin=f.users.findByEmail('admin@example.com').id;
  const target=signUp(f,'promote@example.com');

  assert.equal(f.admin.changeRole(admin,target,'judge').user.role,'judge');
  assert.throws(()=>f.admin.changeRole(admin,admin,'participant'),error=>error.code==='CANNOT_CHANGE_OWN_ROLE');
  assert.throws(()=>f.admin.changeRole(admin,target,'superuser'),error=>error.code==='INVALID_ROLE');

  const inTeam=participantId(f);
  f.team.createTeam(inTeam,'Team Player');
  assert.throws(()=>f.admin.changeRole(admin,inTeam,'judge'),error=>error.code==='USER_IN_TEAM');

  const reset=f.admin.resetAccount(admin,target);
  assert.throws(()=>f.auth.login('promote@example.com','Passw0rd!'),error=>error.code==='INVALID_CREDENTIALS');
  assert.equal(f.auth.login('promote@example.com',reset.temporaryPassword).user.id,target);

  const events=f.audit.list(20).map((event)=>event.eventType);
  assert.ok(events.includes('ROLE_CHANGED'));
  assert.ok(events.includes('ACCOUNT_RESET'));
  f.db.close();
});

// Admin story 3 / NFR3: backups copy the database and artifacts, and old backups are pruned.
test('backups copy the database and uploaded artifacts and keep only the newest ones',async ()=>{
  const f=fixture();
  fs.writeFileSync(path.join(f.uploadDir,'1-artifact.txt'),'artifact');

  const first=f.backups.create('manual');
  assert.equal(first.artifactCount,1);
  assert.ok(fs.existsSync(path.join(f.backupDir,first.name,'hackathon.db')));
  assert.ok(fs.existsSync(path.join(f.backupDir,first.name,'uploads','1-artifact.txt')));

  // Restoring the copy must give back the same accounts.
  const copy=openDatabase(path.join(f.backupDir,first.name,'hackathon.db'));
  assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM users').get().n,6);
  copy.close();

  for(let i=0;i<2;i++){ await new Promise((resolve)=>setTimeout(resolve,5)); f.backups.create('scheduled'); }
  const listed=f.backups.list();
  assert.equal(listed.length,2);
  assert.ok(!listed.some((backup)=>backup.name===first.name));
  assert.ok(f.audit.list(20).some((event)=>event.eventType==='BACKUP_CREATED'));
  f.db.close();
  fs.rmSync(f.backupDir,{recursive:true,force:true});
  fs.rmSync(f.uploadDir,{recursive:true,force:true});
});

// XSS hardening: HTML-bearing repository links and sign-up emails are refused, and the stored artifact type comes from the extension.
test('submission and sign-up reject HTML payloads and artifact type is set by the server',()=>{
  const f=fixture();
  const participant=participantId(f);
  f.team.createTeam(participant,'Safe Team');
  const registration=f.registration.register(participant,1);

  for(const repositoryLink of ['https://x.co" onmouseover="alert(1)','javascript:alert(1)','https://x.co/<script>']){
    assert.throws(
      ()=>f.submission.submit(participant,registration.registrationId,{repositoryLink,description:'Payload link'}),
      error=>error.code==='INVALID_REPOSITORY_LINK'
    );
  }
  assert.throws(()=>f.auth.register('Mallory','<img/src/onerror=alert(1)>@x.co','Passw0rd!'),error=>error.code==='INVALID_EMAIL');

  f.submission.submit(participant,registration.registrationId,{
    repositoryLink:'https://github.com/example/safe',
    description:'Typed upload',
    artifact:{name:'notes.txt',type:'text/html',dataBase64:Buffer.from('plain notes').toString('base64')}
  });
  assert.equal(f.submissions.findByRegistration(registration.registrationId).artifact_mime,'text/plain');
  f.db.close();
});

// UC2 step 3: a full challenge refuses further registrations, and capacity cannot drop below current registrations.
test('challenge capacity refuses registration when full and cannot be set below current registrations',()=>{
  const f=fixture();
  const organizer=organizerId(f);
  f.db.prepare('UPDATE challenges SET max_teams=1 WHERE id=1').run();
  f.team.createTeam(participantId(f),'First Team');
  f.registration.register(participantId(f),1);

  const second=f.users.findByEmail('participant2@example.com').id;
  f.team.createTeam(second,'Second Team');
  assert.throws(()=>f.registration.register(second,1),error=>error.code==='CHALLENGE_FULL');

  const challenge=f.challenges.findById(1);
  const edit=(maxTeams)=>f.organizer.updateChallenge(organizer,1,{
    title:challenge.title,description:challenge.description,rules:challenge.rules,
    minTeamSize:challenge.min_team_size,maxTeamSize:challenge.max_team_size,maxTeams,
    registrationDeadline:challenge.registration_deadline,submissionDeadline:challenge.submission_deadline
  });
  edit('');
  assert.equal(f.challenges.findById(1).max_teams,null);
  f.registration.register(second,1);
  assert.throws(()=>edit(1),error=>error.code==='CAPACITY_CONFLICT');
  assert.throws(()=>edit(0),error=>error.code==='INVALID_CAPACITY');
  f.db.close();
});

// UC2 step 5: registered teams appear in the organizer's registration list.
test('registered teams appear in the organizer registration list',()=>{
  const f=fixture();
  const participant=participantId(f);
  f.team.createTeam(participant,'Listed Team');
  const registration=f.registration.register(participant,1);
  f.submission.submit(participant,registration.registrationId,{repositoryLink:'https://github.com/example/listed',description:'Listed project'});

  const listed=f.organizer.listChallenges(organizerId(f)).find((challenge)=>challenge.id===1).registrations;
  assert.equal(listed.length,1);
  assert.equal(listed[0].teamName,'Listed Team');
  assert.equal(listed[0].size,1);
  assert.ok(listed[0].submittedAt);
  f.db.close();
});

// UC3 extension 2a: after a conflict the organizer sees the project needs a new judge, and cannot reassign the same judge.
test('conflicted submissions are flagged for reassignment and the conflicted judge cannot be reassigned',()=>{
  const f=fixture();
  const submissionId=setupSubmitted(f);
  const organizer=organizerId(f);
  const flag=()=>f.organizer.listSubmissions(organizer).find((item)=>item.submissionId===submissionId);

  assert.equal(flag().needsReassignment,0);
  f.evaluation.declareConflict(judgeId(f),submissionId,'Former teammate');
  assert.equal(flag().needsReassignment,1);
  assert.equal(flag().conflictJudges,'judge@example.com');

  assert.throws(()=>f.organizer.assignJudge(organizer,submissionId,judgeId(f)),error=>error.code==='JUDGE_HAS_CONFLICT');
  f.organizer.assignJudge(organizer,submissionId,secondJudgeId(f));
  assert.equal(flag().needsReassignment,0);
  f.db.close();
});

// UC1 extension 4a: the new version replaces the active one and the previous one is kept in history.
test('updating a submission keeps the previous version and its file in history',()=>{
  const f=fixture();
  const participant=participantId(f);
  f.team.createTeam(participant,'History Team');
  const registration=f.registration.register(participant,1);

  const first=f.submission.submit(participant,registration.registrationId,{
    repositoryLink:'https://github.com/example/v1',
    description:'Version one',
    artifact:{name:'v1.txt',dataBase64:Buffer.from('first file').toString('base64')}
  });
  assert.equal(first.version,1);
  const firstPath=f.submissions.findByRegistration(registration.registrationId).artifact_path;

  const second=f.submission.submit(participant,registration.registrationId,{
    repositoryLink:'https://github.com/example/v2',
    description:'Version two',
    artifact:{name:'v2.txt',dataBase64:Buffer.from('second file').toString('base64')}
  });
  assert.equal(second.version,2);
  assert.equal(second.submissionId,first.submissionId);

  const active=f.submissions.findByRegistration(registration.registrationId);
  assert.equal(active.description,'Version two');
  const history=f.registration.listMine(participant)[0].previousVersions;
  assert.equal(history.length,1);
  assert.equal(history[0].version,1);
  assert.equal(history[0].description,'Version one');
  assert.equal(history[0].artifactName,'v1.txt');
  assert.ok(fs.existsSync(firstPath));
  f.db.close();
});

// UC1 extensions 3a/3b: errors show the deadline time and name the file that failed.
test('submission errors show the deadline and name the failing file',()=>{
  const f=fixture();
  const participant=participantId(f);
  f.team.createTeam(participant,'Message Team');
  const registration=f.registration.register(participant,1);

  assert.throws(
    ()=>f.submission.submit(participant,registration.registrationId,{
      description:'Too big',
      artifact:{name:'huge.zip',dataBase64:Buffer.alloc(1024*1024+1).toString('base64')}
    }),
    error=>error.code==='FILE_TOO_LARGE' && error.message.includes('huge.zip')
  );
  assert.throws(
    ()=>f.submission.submit(participant,registration.registrationId,{
      description:'Fake pdf',
      artifact:{name:'slides.pdf',dataBase64:Buffer.from('not a pdf').toString('base64')}
    }),
    error=>error.code==='FILE_CONTENT_MISMATCH' && error.message.startsWith('slides.pdf')
  );

  f.db.prepare("UPDATE challenges SET submission_deadline='2020-01-01T00:00:00.000Z' WHERE id=1").run();
  assert.throws(
    ()=>f.submission.submit(participant,registration.registrationId,{repositoryLink:'https://example.com',description:'Late'}),
    error=>error.code==='SUBMISSION_CLOSED' && error.message.includes('2020')
  );
  f.db.close();
});
