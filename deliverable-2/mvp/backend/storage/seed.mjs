// Deterministic demo users, future-relative deadlines, and one starter challenge.
// The organizer can create additional challenges from the UI; the starter challenge
// exists only so the MVP is immediately demonstrable after a clean reset.
import { hashPassword } from '../auth/password.mjs';

export function seedDatabase(db) {
  // Do not reseed an already initialized database.
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  // Prepare one reusable user insert statement.
  const insertUser = db.prepare(`
    INSERT INTO users(name,email,password_hash,password_salt,role)
    VALUES(?,?,?,?,?)
  `);

  // Seed the four role types plus a second participant for team joining demos.
  const demoUsers = [
    ['Participant Demo', 'participant@example.com', 'participant'],
    ['Second Participant', 'participant2@example.com', 'participant'],
    ['Organizer Demo', 'organizer@example.com', 'organizer'],
    ['Judge Demo', 'judge@example.com', 'judge'],
    ['Second Judge', 'judge2@example.com', 'judge'],
    ['Platform Admin', 'admin@example.com', 'admin']
  ];

  // All demo accounts intentionally share one documented classroom password.
  for (const [name, email, role] of demoUsers) {
    const { salt, hash } = hashPassword('Pass123!');
    insertUser.run(name, email, hash, salt, role);
  }

  // Look up the seeded organizer so the starter challenge has a real owner.
  const organizerId = Number(
    db.prepare("SELECT id FROM users WHERE email='organizer@example.com'").get().id
  );

  // Use relative future deadlines so the demo remains usable whenever it is reset.
  const now = Date.now();
  const registrationDeadline = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const submissionDeadline = new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString();

  // Create one starter challenge with the fields required by D1 FR3/FR4.
  const challenge = db.prepare(`
    INSERT INTO challenges(
      title,description,rules,min_team_size,max_team_size,
      registration_deadline,submission_deadline,status,organizer_id,published_at
    ) VALUES(?,?,?,?,?,?,?,'open',?,NULL)
  `).run(
    'Sustainable Campus Hackathon',
    'Build a practical digital solution that improves university life.',
    'Submit one project before the deadline. Teams must follow the configured team-size limits.',
    1,
    4,
    registrationDeadline,
    submissionDeadline,
    organizerId
  );

  // Capture the challenge id so its initial rubric can be linked correctly.
  const challengeId = Number(challenge.lastInsertRowid);

  // Seed a configurable rubric that the organizer can edit before judging begins.
  const addCriterion = db.prepare(`
    INSERT INTO evaluation_criteria(challenge_id,name,description,weight,max_score)
    VALUES(?,?,?,?,?)
  `);
  addCriterion.run(challengeId, 'Technical Quality', 'Correctness, robustness and implementation quality.', 0.4, 10);
  addCriterion.run(challengeId, 'Innovation', 'Originality and creativity of the solution.', 0.3, 10);
  addCriterion.run(challengeId, 'Impact', 'Usefulness and relevance to the challenge.', 0.3, 10);
}
