'use strict';

const REQUIRED_COLUMNS = ['status', 'priority', 'due_date'];

function getColumnNames(db) {
  return db.prepare('PRAGMA table_info(tasks)').all().map((column) => column.name);
}

function tableExists(db, name) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return Boolean(row);
}

/**
 * Upgrades a legacy `tasks` table (created before status/priority/due_date
 * existed) to the full Project 3 schema, without losing existing rows.
 *
 * SQLite cannot add a table-level CHECK constraint or NOT NULL-with-CHECK
 * columns to an existing table via ALTER TABLE, so when legacy columns are
 * detected this migration performs the standard "rebuild" procedure:
 *   1. Create a new table with the correct schema/constraints.
 *   2. Copy existing rows across, backfilling new columns with safe defaults
 *      and normalizing `completed` -> `status` so the two stay consistent.
 *   3. Drop the old table and rename the new one into place.
 *   4. Recreate indexes and the updated_at trigger.
 *
 * This migration is idempotent: if the table already has the required
 * columns (e.g. because migration 002 created it fresh, or this migration
 * already ran), it does nothing.
 */
module.exports = {
  id: 3,
  name: 'upgrade_legacy_tasks_table',
  up(db) {
    if (!tableExists(db, 'tasks')) {
      // Nothing to upgrade; migration 002 will have created the table fresh.
      return;
    }

    const columns = getColumnNames(db);
    const missingColumns = REQUIRED_COLUMNS.filter((col) => !columns.includes(col));

    if (missingColumns.length === 0) {
      return;
    }

    db.exec(`
      CREATE TABLE tasks__rebuild (
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

    const hasStatus = columns.includes('status');
    const hasPriority = columns.includes('priority');
    const hasDueDate = columns.includes('due_date');

    const statusExpr = hasStatus
      ? 'status'
      : "CASE WHEN completed = 1 THEN 'completed' ELSE 'pending' END";
    const priorityExpr = hasPriority ? 'priority' : "'medium'";
    const dueDateExpr = hasDueDate ? 'due_date' : 'NULL';

    db.exec(`
      INSERT INTO tasks__rebuild
        (id, title, description, status, priority, due_date, completed, created_at, updated_at)
      SELECT
        id,
        title,
        description,
        ${statusExpr},
        ${priorityExpr},
        ${dueDateExpr},
        completed,
        COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      FROM tasks
    `);

    db.exec('DROP TABLE tasks');
    db.exec('ALTER TABLE tasks__rebuild RENAME TO tasks');

    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks (completed)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date)');

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
