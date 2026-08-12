#!/usr/bin/env node
'use strict';

/**
 * Standalone migration CLI.
 *
 * Usage:
 *   npm run db:migrate                 # uses DB_PATH from .env / environment
 *   DB_PATH=./database/test.db npm run db:migrate
 *
 * Can be run independently of the server, and is used by both the
 * development and test setups to bring a SQLite file up to the latest
 * schema without starting Express.
 */

require('dotenv').config();

const { initializeDatabase, closeDatabase, getLastMigrationResult } = require('../src/config/database');

function main() {
  // initializeDatabase() runs all pending migrations as part of opening the
  // connection. getLastMigrationResult() reports exactly what that call did,
  // so migrations only ever run once per invocation of this script.
  initializeDatabase();
  const { applied } = getLastMigrationResult();

  if (applied.length === 0) {
    console.log('Database is already up to date. No migrations applied.');
  } else {
    console.log(`Applied ${applied.length} migration(s):`);
    applied.forEach((name) => console.log(`  - ${name}`));
  }

  closeDatabase();
}

try {
  main();
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
}
