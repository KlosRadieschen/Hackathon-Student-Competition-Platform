// Persistence operations for user accounts, judge lookup, and admin account management.
export function createUserRepository(db) {
  return {
    findByEmail(email) {
      return db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(email) || null;
    },
    findById(id) {
      return db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(id) || null;
    },
    listJudges() {
      return db.prepare(`SELECT id,name,email,role FROM users WHERE role='judge' ORDER BY name`).all();
    },
    listAll() {
      return db.prepare('SELECT id,name,email,role FROM users ORDER BY id').all();
    },
    create(name, email, hash, salt, role) {
      const r = db.prepare('INSERT INTO users(name,email,password_hash,password_salt,role) VALUES(?,?,?,?,?)').run(name, email, hash, salt, role);
      return Number(r.lastInsertRowid);
    },
    setRole(id, role) {
      db.prepare('UPDATE users SET role=? WHERE id=?').run(role, id);
    },
    setPassword(id, hash, salt) {
      db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').run(hash, salt, id);
    }
  };
}
