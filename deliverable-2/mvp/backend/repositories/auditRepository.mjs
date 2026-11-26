// Persistence operations for traceable competition activity events.
export function createAuditRepository(db) {
  return {
    add(userId, eventType, entityType, entityId, details = {}) {
      db.prepare(`INSERT INTO audit_logs(user_id,event_type,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?)`)
        .run(userId || null, eventType, entityType, entityId == null ? null : String(entityId), JSON.stringify(details), new Date().toISOString());
    },
    list(limit = 100) {
      return db.prepare(`
        SELECT a.id,a.event_type AS eventType,a.entity_type AS entityType,a.entity_id AS entityId,a.details_json AS detailsJson,a.created_at AS createdAt,
               u.email AS userEmail
        FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
        ORDER BY a.id DESC LIMIT ?
      `).all(limit).map((row) => ({ ...row, details: JSON.parse(row.detailsJson || '{}') }));
    },
    listByType(eventType, limit = 100) {
      return db.prepare(`
        SELECT a.id,a.event_type AS eventType,a.entity_type AS entityType,a.entity_id AS entityId,a.details_json AS detailsJson,a.created_at AS createdAt,
               u.email AS userEmail
        FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
        WHERE a.event_type=?
        ORDER BY a.id DESC LIMIT ?
      `).all(eventType, limit).map((row) => ({ ...row, details: JSON.parse(row.detailsJson || '{}') }));
    }
  };
}
