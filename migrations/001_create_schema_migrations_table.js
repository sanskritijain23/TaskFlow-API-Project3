'use strict';

/**
 * Bootstraps the migration tracking table itself.
 * Every other migration is recorded here after it runs successfully,
 * so re-running the migrator on an already-migrated database is a no-op.
 */
module.exports = {
  id: 1,
  name: 'create_schema_migrations_table',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  },
};
