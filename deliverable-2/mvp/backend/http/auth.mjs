// HTTP authentication and role-authorization guards.
import { verifyToken } from '../auth/token.mjs';

export function authenticate(req, users) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) throw Object.assign(new Error('Authentication required'), { status: 401, code: 'AUTH_REQUIRED' });
  const user = users.findById(Number(payload.sub));
  if (!user) throw Object.assign(new Error('User not found'), { status: 401, code: 'AUTH_REQUIRED' });
  return user;
}

export function requireRole(user, ...roles) {
  if (!roles.includes(user.role)) throw Object.assign(new Error('You are not allowed to perform this action'), { status: 403, code: 'FORBIDDEN' });
}
