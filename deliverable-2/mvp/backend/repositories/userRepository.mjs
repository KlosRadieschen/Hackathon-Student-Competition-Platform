// Persistence operations for user accounts and judge lookup.
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
    }
  };
}
