'use strict';

/**
 * Creates the `tasks` table with the complete Project 3 schema.
 *
 * Uses CREATE TABLE IF NOT EXISTS so it is safe to run against a brand new
 * database file. On a database that already has an older `tasks` table
 * (pre-Project-3 schema), this migration is a no-op by design -- the actual
 * upgrade of legacy tables is handled by migration 003, which inspects the
 * existing columns and rebuilds the table safely if needed.
 */
function tableExists(db, name) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return Boolean(row);
}

module.exports = {
  id: 2,
  name: 'create_tasks_table',
  up(db) {
    const alreadyExisted = tableExists(db, 'tasks');

    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
        description TEXT,
        status      TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'in_progress', 'completed')),
        priority    TEXT NOT NULL DEFAULT 'medium'
                      CHECK (priority IN ('low', 'medium', 'high')),
        due_date    TEXT,
        completed   INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )
    `);

    if (alreadyExisted) {
      // The table pre-dated this migration (legacy schema). Its columns may
      // not include status/priority/due_date yet, so creating indexes on
      // them here would fail. Migration 003 rebuilds legacy tables and
      // recreates indexes/trigger itself once the schema is correct.
      return;
    }

    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks (completed)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date)');

    // Guarded with "WHEN NEW.updated_at IS OLD.updated_at" so that the trigger
    // only stamps updated_at when the application did not already set it
    // explicitly, which keeps the trigger from firing redundantly and avoids
    // any risk of recursive UPDATE chains.
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_tasks_set_updated_at
      AFTER UPDATE ON tasks
      FOR EACH ROW
      WHEN NEW.updated_at IS OLD.updated_at
      BEGIN
        UPDATE tasks
        SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = NEW.id;
      END
    `);
  },
};
