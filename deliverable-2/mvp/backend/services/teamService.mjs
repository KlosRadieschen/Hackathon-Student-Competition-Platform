// Business rules for creating/joining one team per participant.
import { randomBytes } from 'node:crypto';

export function createTeamService(teams, audit) {
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
      teams.addMember(team.id, userId);
      audit.add(userId, 'TEAM_JOINED', 'team', team.id, {});
      return teams.findForUser(userId);
    }
  };
}
