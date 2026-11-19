// Business logic for login, password verification, token creation, and login auditing.
import { verifyPassword } from '../auth/password.mjs';
import { signToken } from '../auth/token.mjs';

export function createAuthService(users, audit) {
  return {
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
