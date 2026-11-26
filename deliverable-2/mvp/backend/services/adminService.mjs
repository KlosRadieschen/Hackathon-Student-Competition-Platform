// Platform-admin business logic: account roles, account resets, failed-upload log, and backups.
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/password.mjs';

const ROLES = ['participant', 'organizer', 'judge', 'admin'];

export function createAdminService(users, teams, audit, backups) {
  function requireUser(userId) {
    const user = users.findById(userId);
    if (!user) throw Object.assign(new Error('User not found'), { status: 404, code: 'USER_NOT_FOUND' });
    return user;
  }

  return {
    listUsers() {
      return users.listAll();
    },

    // Change a user's role; admins cannot change their own role so the platform is never left without one.
    changeRole(adminId, userId, role) {
      const user = requireUser(userId);
      if (!ROLES.includes(role)) {
        throw Object.assign(new Error(`Role must be one of: ${ROLES.join(', ')}`), { status: 400, code: 'INVALID_ROLE' });
      }
      if (Number(userId) === Number(adminId)) {
        throw Object.assign(new Error('You cannot change your own role'), { status: 409, code: 'CANNOT_CHANGE_OWN_ROLE' });
      }
      if (user.role === role) return { user };
      // A judge or organizer who is still on a participant team could end up judging their own team.
      if (user.role === 'participant' && teams.findForUser(userId)) {
        throw Object.assign(new Error('This participant must leave their team before their role can change'), { status: 409, code: 'USER_IN_TEAM' });
      }
      users.setRole(userId, role);
      audit.add(adminId, 'ROLE_CHANGED', 'user', userId, { from: user.role, to: role });
      return { user: users.findById(userId) };
    },

    // Replace a user's password with a one-off temporary password that the admin hands over.
    resetAccount(adminId, userId) {
      requireUser(userId);
      const temporaryPassword = randomBytes(9).toString('base64url');
      const { salt, hash } = hashPassword(temporaryPassword);
      users.setPassword(userId, hash, salt);
      audit.add(adminId, 'ACCOUNT_RESET', 'user', userId, {});
      return { userId, temporaryPassword };
    },

    uploadErrors(limit = 100) {
      return audit.listByType('UPLOAD_FAILED', limit);
    },

    listBackups() {
      return backups.list();
    },

    createBackup(adminId) {
      return backups.create('manual', adminId);
    }
  };
}
