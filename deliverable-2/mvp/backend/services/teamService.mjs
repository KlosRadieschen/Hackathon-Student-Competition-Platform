// Business rules for creating, joining, and leaving one team per participant.
import { randomBytes } from 'node:crypto';

export function createTeamService(teams, audit, registrations, challenges) {
  // Return the challenge a team is registered for, or null; throw once membership is locked.
  function registeredChallenge(teamId) {
    const registration = registrations.findByTeam(teamId);
    if (!registration) return null;
    const challenge = challenges.findById(registration.challenge_id);
    if (challenge.status !== 'open' || Date.now() > Date.parse(challenge.submission_deadline)) {
      throw Object.assign(new Error('Team membership is locked after submissions close'), { status: 409, code: 'TEAM_LOCKED' });
    }
    return challenge;
  }

  return {
    getMyTeam(userId) {
      return teams.findForUser(userId);
    },
    createTeam(userId, name) {
      if (teams.findForUser(userId)) throw Object.assign(new Error('You already belong to a team'), { status: 409, code: 'ALREADY_IN_TEAM' });
      const clean = String(name || '').trim();
      if (clean.length < 2) throw Object.assign(new Error('Team name must contain at least 2 characters'), { status: 400, code: 'INVALID_TEAM_NAME' });
      const inviteCode = randomBytes(4).toString('hex').toUpperCase();
      const teamId = teams.create(clean, inviteCode, userId);
      audit.add(userId, 'TEAM_CREATED', 'team', teamId, { name: clean });
      return teams.findForUser(userId);
    },
    joinTeam(userId, inviteCode) {
      if (teams.findForUser(userId)) throw Object.assign(new Error('You already belong to a team'), { status: 409, code: 'ALREADY_IN_TEAM' });
      const team = teams.findByInviteCode(String(inviteCode || '').trim().toUpperCase());
      if (!team) throw Object.assign(new Error('Invite code not found'), { status: 404, code: 'INVITE_NOT_FOUND' });
      // A registered team must stay within its challenge's maximum team size.
      const challenge = registeredChallenge(team.id);
      if (challenge && teams.size(team.id) + 1 > challenge.max_team_size) {
        throw Object.assign(
          new Error(`This team already has the maximum of ${challenge.max_team_size} members for ${challenge.title}`),
          { status: 409, code: 'TEAM_FULL' }
        );
      }
      teams.addMember(team.id, userId);
      audit.add(userId, 'TEAM_JOINED', 'team', team.id, {});
      return teams.findForUser(userId);
    },
    leaveTeam(userId) {
      const team = teams.findForUser(userId);
      if (!team) throw Object.assign(new Error('You are not in a team'), { status: 409, code: 'NOT_IN_TEAM' });
      // A registered team must stay at or above its challenge's minimum team size.
      const challenge = registeredChallenge(team.id);
      if (challenge && team.teamSize - 1 < challenge.min_team_size) {
        throw Object.assign(
          new Error(`Your team is registered for ${challenge.title}, which needs at least ${challenge.min_team_size} members`),
          { status: 409, code: 'TEAM_SIZE_INVALID' }
        );
      }
      const outcome = teams.removeMember(team.id, userId);
      audit.add(userId, 'TEAM_LEFT', 'team', team.id, outcome);
      return outcome;
    }
  };
}
