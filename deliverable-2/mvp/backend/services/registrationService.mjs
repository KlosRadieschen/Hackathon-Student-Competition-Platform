// UC2 business rules for challenge registration eligibility.
export function createRegistrationService(challenges, teams, registrations, audit) {
  return {
    register(userId, challengeId) {
      const challenge = challenges.findById(challengeId);
      if (!challenge) throw Object.assign(new Error('Challenge not found'), { status: 404, code: 'CHALLENGE_NOT_FOUND' });
      if (challenge.status !== 'open' || Date.now() > Date.parse(challenge.registration_deadline)) {
        throw Object.assign(new Error('Registration is closed'), { status: 409, code: 'REGISTRATION_CLOSED' });
      }
      const team = teams.findForUser(userId);
      if (!team) throw Object.assign(new Error('Create or join a team first'), { status: 409, code: 'TEAM_REQUIRED' });
      const size = teams.size(team.id);
      if (size < challenge.min_team_size || size > challenge.max_team_size) {
        throw Object.assign(new Error(`Team size must be between ${challenge.min_team_size} and ${challenge.max_team_size}`), { status: 409, code: 'TEAM_SIZE_INVALID' });
      }
      const existing = registrations.findByTeam(team.id);
      if (existing) {
        const sameChallenge = Number(existing.challenge_id) === Number(challengeId);
        throw Object.assign(
          new Error(sameChallenge ? 'Team is already registered for this challenge' : 'A team can register for only one challenge in the MVP'),
          { status: 409, code: sameChallenge ? 'ALREADY_REGISTERED' : 'TEAM_ALREADY_REGISTERED' }
        );
      }
      const registrationId = registrations.create(team.id, challengeId, new Date().toISOString());
      audit.add(userId, 'TEAM_REGISTERED', 'registration', registrationId, { teamId: team.id, challengeId });
      return { registrationId, status: 'registered' };
    },
    listMine(userId) {
      const team = teams.findForUser(userId);
      return team ? registrations.listForTeam(team.id) : [];
    }
  };
}
