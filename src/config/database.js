'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { runMigrations } = require('../db/migrator');

let db;
let lastMigrationResult = { applied: [] };

function resolveDbPath() {
  return process.env.DB_PATH || './database/tasks.db';
}

function initializeDatabase() {
  const dbPath = resolveDbPath();

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  lastMigrationResult = runMigrations(db);

  return db;
}

/**
 * Returns the { applied: string[] } result of the migrations that ran
 * during the most recent initializeDatabase() call, so callers (e.g. the
 * db:migrate CLI) can report what happened without invoking runMigrations()
 * a second time.
 */
function getLastMigrationResult() {
  return lastMigrationResult;
}

function getDatabase() {
  if (!db) {
    throw new Error('Database has not been initialized. Call initializeDatabase() first.');
  }
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = undefined;
  }
}

module.exports = { initializeDatabase, getDatabase, closeDatabase, getLastMigrationResult };
