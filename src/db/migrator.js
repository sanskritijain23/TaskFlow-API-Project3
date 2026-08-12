'use strict';

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

function loadMigrations() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.js'))
    .sort();

  return files.map((file) => require(path.join(MIGRATIONS_DIR, file)));
}

/**
 * Applies every migration that has not already been recorded in
 * `schema_migrations`, in ascending id order, inside a single transaction.
 *
 * Safe to call every time the app or test suite starts up: on an
 * already-migrated database this is a fast no-op.
 */
function runMigrations(db) {
  const migrations = loadMigrations().sort((a, b) => a.id - b.id);

  // Migration 1 must always run first since it creates the tracking table
  // that every other migration (including this check) depends on.
  const bootstrap = migrations.find((migration) => migration.id === 1);
  if (bootstrap) {
    bootstrap.up(db);
  }

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((row) => row.id)
  );

  const pending = migrations.filter(
    (migration) => migration.id !== 1 && !applied.has(migration.id)
  );

  if (pending.length === 0) {
    if (!applied.has(1) && bootstrap) {
      db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(
        bootstrap.id,
        bootstrap.name
      );
    }
    return { applied: [] };
  }

  const appliedNames = [];

  const runAll = db.transaction(() => {
    if (!applied.has(1) && bootstrap) {
      db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(
        bootstrap.id,
        bootstrap.name
      );
    }

    for (const migration of pending) {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(
        migration.id,
        migration.name
      );
      appliedNames.push(migration.name);
    }
  });

  runAll();

  return { applied: appliedNames };
}

module.exports = { runMigrations };
