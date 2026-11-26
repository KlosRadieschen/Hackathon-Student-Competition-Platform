// Business logic for sign-up, login, password verification, token creation, and login auditing.
import { hashPassword, verifyPassword } from '../auth/password.mjs';
import { signToken } from '../auth/token.mjs';

export function createAuthService(users, audit) {
  return {
    // Self-service sign-up always creates a participant; other roles are granted by a platform admin.
    register(name, email, password) {
      const cleanName = String(name || '').trim();
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanPassword = String(password || '');
      if (cleanName.length < 2) {
        throw Object.assign(new Error('Name must contain at least 2 characters'), { status: 400, code: 'INVALID_NAME' });
      }
      if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(cleanEmail)) {
        throw Object.assign(new Error('Enter a valid email address'), { status: 400, code: 'INVALID_EMAIL' });
      }
      if (cleanPassword.length < 8 || !/[A-Za-z]/.test(cleanPassword) || !/\d/.test(cleanPassword)) {
        throw Object.assign(new Error('Password must be at least 8 characters and contain a letter and a number'), { status: 400, code: 'WEAK_PASSWORD' });
      }
      if (users.findByEmail(cleanEmail)) {
        throw Object.assign(new Error('An account with this email already exists'), { status: 409, code: 'EMAIL_TAKEN' });
      }
      const { salt, hash } = hashPassword(cleanPassword);
      const id = users.create(cleanName, cleanEmail, hash, salt, 'participant');
      audit.add(id, 'USER_REGISTERED', 'user', id, { role: 'participant' });
      const user = users.findById(id);
      return { token: signToken(user), user };
    },
    login(email, password) {
      const user = users.findByEmail(String(email || '').trim());
      if (!user || !verifyPassword(String(password || ''), user.password_salt, user.password_hash)) {
        throw Object.assign(new Error('Invalid email or password'), { status: 401, code: 'INVALID_CREDENTIALS' });
      }
      audit.add(user.id, 'LOGIN_SUCCESS', 'user', user.id, { role: user.role });
      return {
        token: signToken(user),
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      };
    }
  };
}
