// UC2 business rules for challenge registration eligibility.
export function createRegistrationService(challenges, teams, registrations, audit, submissions) {
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
      // UC2 step 3: the challenge must not be full (the waitlist from extension 3b is Release 1).
      if (challenge.max_teams != null && challenges.registrationCount(challengeId) >= challenge.max_teams) {
        throw Object.assign(new Error(`This challenge is full (${challenge.max_teams} teams)`), { status: 409, code: 'CHALLENGE_FULL' });
      }
      const registrationId = registrations.create(team.id, challengeId, new Date().toISOString());
      audit.add(userId, 'TEAM_REGISTERED', 'registration', registrationId, { teamId: team.id, challengeId });
      return { registrationId, status: 'registered' };
    },
    listMine(userId) {
      const team = teams.findForUser(userId);
      if (!team) return [];
      // Include earlier submission versions so the team can see its history.
      return registrations.listForTeam(team.id).map((registration) => ({
        ...registration,
        previousVersions: registration.submissionId ? submissions.listVersions(registration.submissionId) : []
      }));
    }
  };
}
