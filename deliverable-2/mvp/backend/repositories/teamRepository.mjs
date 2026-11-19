// Persistence operations for teams, invite codes, and memberships.
export function createTeamRepository(db) {
  return {
    findForUser(userId) {
      return db.prepare(`
        SELECT t.id,t.name,t.invite_code AS inviteCode,t.owner_user_id AS ownerUserId,
               (SELECT COUNT(*) FROM team_members tm2 WHERE tm2.team_id=t.id) AS teamSize
        FROM teams t JOIN team_members tm ON tm.team_id=t.id
        WHERE tm.user_id=?
      `).get(userId) || null;
    },
    findByInviteCode(inviteCode) {
      return db.prepare(`SELECT id,name,invite_code AS inviteCode,owner_user_id AS ownerUserId FROM teams WHERE invite_code=?`).get(inviteCode) || null;
    },
    create(name, inviteCode, ownerUserId) {
      db.exec('BEGIN');
      try {
        const r = db.prepare(`INSERT INTO teams(name,invite_code,owner_user_id) VALUES(?,?,?)`).run(name, inviteCode, ownerUserId);
        const teamId = Number(r.lastInsertRowid);
        db.prepare(`INSERT INTO team_members(team_id,user_id) VALUES(?,?)`).run(teamId, ownerUserId);
        db.exec('COMMIT');
        return teamId;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    addMember(teamId, userId) {
      db.prepare(`INSERT INTO team_members(team_id,user_id) VALUES(?,?)`).run(teamId, userId);
    },
    size(teamId) {
      return Number(db.prepare(`SELECT COUNT(*) AS n FROM team_members WHERE team_id=?`).get(teamId)?.n || 0);
    }
  };
}
