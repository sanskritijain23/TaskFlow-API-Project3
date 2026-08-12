const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../src/db/migrator');
const {
  initializeDatabase,
  closeDatabase,
  getLastMigrationResult,
} = require('../../src/config/database');

const dbPath = path.join(__dirname, '..', 'tmp', 'migrator-test.db');
const cliDbPath = path.join(__dirname, '..', 'tmp', 'migrator-cli-test.db');

function freshDb() {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return new Database(dbPath);
}

describe('migrator', () => {
  afterEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    closeDatabase();
    if (fs.existsSync(cliDbPath)) {
      fs.unlinkSync(cliDbPath);
    }
  });

  test('creates the full Project 3 schema on a brand new database', () => {
    const db = freshDb();

    const { applied } = runMigrations(db);
    expect(applied).toEqual(
      expect.arrayContaining(['create_tasks_table', 'upgrade_legacy_tasks_table'])
    );

    const columns = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'title',
        'description',
        'status',
        'priority',
        'due_date',
        'completed',
        'created_at',
        'updated_at',
      ])
    );

    db.close();
  });

  test('is idempotent: running twice applies nothing the second time', () => {
    const db = freshDb();
    runMigrations(db);
    const second = runMigrations(db);
    expect(second.applied).toEqual([]);
    db.close();
  });

  test('safely upgrades a pre-existing legacy tasks table without losing data', () => {
    const db = freshDb();

    db.exec(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.prepare('INSERT INTO tasks (title, description, completed) VALUES (?, ?, ?)').run(
      'Legacy completed task',
      'desc',
      1
    );
    db.prepare('INSERT INTO tasks (title, description, completed) VALUES (?, ?, ?)').run(
      'Legacy open task',
      null,
      0
    );

    runMigrations(db);

    const columns = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['status', 'priority', 'due_date']));

    const rows = db.prepare('SELECT * FROM tasks ORDER BY id').all();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: 'Legacy completed task', status: 'completed', completed: 1 });
    expect(rows[1]).toMatchObject({ title: 'Legacy open task', status: 'pending', completed: 0 });

    // Constraints must now be enforced going forward.
    expect(() =>
      db.prepare("INSERT INTO tasks (title, status) VALUES ('x', 'not_a_status')").run()
    ).toThrow();

    db.close();
  });
});

describe('initializeDatabase() + getLastMigrationResult() (used by scripts/migrate.js)', () => {
  beforeEach(() => {
    // Defensively close any connection left open by a previous test before
    // touching the file on disk. On Windows, deleting a file while a
    // better-sqlite3 connection to it is still open throws EBUSY, whereas
    // Linux silently allows it - closing first keeps this cross-platform.
    closeDatabase();
    if (fs.existsSync(cliDbPath)) {
      fs.unlinkSync(cliDbPath);
    }
    fs.mkdirSync(path.dirname(cliDbPath), { recursive: true });
    process.env.DB_PATH = cliDbPath;
  });

  afterEach(() => {
    // Every connection opened via initializeDatabase() in this describe
    // block must be explicitly closed before the file is removed, so the
    // next test's beforeEach (or any later cleanup) never races an open
    // handle on Windows.
    closeDatabase();
    if (fs.existsSync(cliDbPath)) {
      fs.unlinkSync(cliDbPath);
    }
  });

  test('first run against a fresh database reports the migrations that were applied', () => {
    initializeDatabase();

    const { applied } = getLastMigrationResult();
    expect(applied).toEqual(
      expect.arrayContaining(['create_tasks_table', 'upgrade_legacy_tasks_table'])
    );
    expect(applied.length).toBeGreaterThan(0);
  });

  test('a second run (new connection to the same file) is a no-op and reports nothing applied', () => {
    initializeDatabase();
    expect(getLastMigrationResult().applied.length).toBeGreaterThan(0);
    closeDatabase();

    // Simulates running `npm run db:migrate` a second time against a
    // database that is already up to date, exactly as scripts/migrate.js
    // does: open a fresh connection and read the result of that single
    // initializeDatabase() call, without calling runMigrations() again.
    initializeDatabase();
    expect(getLastMigrationResult().applied).toEqual([]);
  });
});
