# Architecture

TaskFlow API uses a small MVC-style layered structure. The app keeps routing,
validation, request handling, and database access in separate files, without
adding unnecessary services/repository abstractions on top.

```text
Client
  |
  v
server.js               (entry point: env, DB init, HTTP server, shutdown)
  |
  v
src/app.js              (Express app: middleware, health check, routes, error handler)
  |
  v
src/routes/             (URL -> validation middleware -> controller wiring)
  |
  v
src/middleware/          (request validation, centralized error handling)
  |
  v
src/controllers/        (thin HTTP glue: parse request, call model, shape response)
  |
  v
src/models/              (all SQL lives here; parameterized queries only)
  |
  v
src/config/database.js  (SQLite connection + migration bootstrap)
  |
  v
migrations/              (versioned schema changes, run by src/db/migrator.js)
```

## Request lifecycle

1. `server.js` starts the process: loads `.env`, calls `initializeDatabase()`
   (which opens the SQLite file and runs any pending migrations), then starts
   the HTTP server.
2. Every request passes through `morgan` (access logging) and
   `express.json()` (body parsing) in `src/app.js`.
3. `GET /api/health` is handled directly in `app.js` and never touches the
   database.
4. Everything under `/api/v1/tasks` is routed through `src/routes/task.routes.js`,
   which attaches the relevant validation middleware (`src/middleware/validation.js`
   + a Joi schema from `src/validators/task.validator.js`) in front of each
   controller action.
5. If validation fails, the middleware calls `next(validationError)` with a
   `400` status and a `details` array; the route's controller is never
   reached.
6. If validation passes, the controller (`src/controllers/task.controller.js`)
   calls the corresponding model function, wraps the result in the standard
   `{ success, data }` / `{ success, data, pagination }` envelope, and sends
   the response — or calls `next(error)` if the model throws or the resource
   isn't found.
7. Any error reaching `next()` (validation, not-found, status/completed
   conflict, or an unexpected database error) is handled by the single
   `src/middleware/errorHandler.js` at the bottom of the middleware stack,
   which is the only place that writes an error response body.
8. Unmatched routes fall through to a small JSON 404 handler registered just
   before the error handler.

## Layered architecture

- **Routes** only wire URLs to validation + controller functions. No business
  logic lives here.
- **Middleware** (`validation.js`, `errorHandler.js`) is generic and reusable
  across all routes; it knows nothing about tasks specifically.
- **Controllers** are intentionally thin: they read `req.params`/`req.body`/
  `req.query` (already validated and coerced by the time they run), call
  exactly one model function, and translate the result into an HTTP response.
  No SQL and no cross-cutting business rules live in a controller.
- **Models** (`src/models/task.model.js`) own all SQL. Every query is
  parameterized; the only request-derived values ever spliced into query
  *text* (as opposed to bound as parameters) are `sortBy`/`order`, and both
  are re-validated against a hardcoded allowlist inside the model itself
  before being used, independent of the Joi validation the route already
  performed. This keeps the model safe to call directly (e.g. from tests)
  without relying on the HTTP layer for protection.
- **Config/DB** (`src/config/database.js`, `src/db/migrator.js`) owns the
  SQLite connection lifecycle and schema migrations, and is the only place
  that knows the database file path.

## Database connection lifecycle

- `initializeDatabase()` resolves `DB_PATH` (from the environment, read at
  call time), creates the containing directory if needed, opens a
  `better-sqlite3` connection, enables WAL journal mode, and runs
  `runMigrations()` before returning.
- `getDatabase()` returns the existing connection, and throws clearly if
  called before `initializeDatabase()`.
- `closeDatabase()` closes the connection and clears the reference, so a
  process (or a test file) can call `initializeDatabase()` again afterward
  and get a fresh connection to the same file.
- `server.js` listens for `SIGINT`/`SIGTERM` and calls `closeDatabase()`
  during shutdown so the SQLite file is always closed cleanly.

## Development / test database isolation

- `DB_PATH` is the single environment variable that controls which SQLite
  file a running process uses. It is read at the moment `initializeDatabase()`
  is called, not cached at module-load time, which keeps it safe to change
  between test files.
- Local development uses `./database/tasks.db` (the default, and what
  `.env.example` documents).
- Every test file sets `process.env.DB_PATH` to its own file under
  `tests/tmp/` *before* requiring `src/app.js` or `src/config/database.js`,
  so tests never read or write the development database, and the two
  integration/unit test files don't share a database file with each other
  either.
- `tests/tmp/` is created on demand by each test file's `beforeAll` hook and
  the database file is deleted in `afterAll`, so test runs don't leave stale
  state behind and don't depend on execution order.

## Schema constraints

See `DATABASE_DESIGN.md` for the full column-by-column breakdown. At a
glance: `id` is the primary key, `title`/`status`/`priority`/`completed`/
`created_at`/`updated_at` are `NOT NULL`, and `title`/`status`/`priority`/
`completed` each carry a `CHECK` constraint, so invalid data is rejected by
SQLite itself even if it somehow bypasses application-level Joi validation.

## Migration strategy

`src/db/migrator.js` reads every file in `migrations/`, sorted by filename,
and tracks which ones have already run in a `schema_migrations` table. Each
migration file exports `{ id, name, up(db) }`. On startup (and via
`npm run db:migrate`), `runMigrations(db)`:

1. Always ensures `schema_migrations` exists first (migration 1).
2. Finds any migration whose `id` isn't yet recorded.
3. Runs all pending migrations inside a single SQLite transaction and records
   each one as it completes.

This makes migrations idempotent (running them against an up-to-date
database is a fast no-op) and safe to run automatically every time the app
or test suite starts, without needing a separate manual "did I migrate
already?" step. Migration 003 specifically handles the case where a database
file already exists from before Project 3 (missing `status`/`priority`/
`due_date`): it detects the legacy shape via `PRAGMA table_info(tasks)` and
rebuilds the table in place, preserving every row.

## Error handling

All errors funnel through one middleware (`src/middleware/errorHandler.js`),
which enforces two things:

1. **Consistent shape.** Every error response is
   `{ success: false, error: { message, details? } }`.
2. **No internal leakage.** Only errors we throw ourselves with an explicit
   `statusCode < 500` (validation failures, 404s, the status/completed
   conflict) have their `message`/`details` sent to the client. Anything
   else — including raw `better-sqlite3` errors, which can carry SQL text or
   a CHECK constraint expression in their `.message` — is reduced to a
   generic `500 Internal Server Error` in the response. The full error is
   logged with `console.error` only when `NODE_ENV` is unset or
   `development`, never during tests and never in production, and never as
   part of the HTTP response body.

## Security decisions

- **Parameterized SQL everywhere.** Every value that comes from the client
  (title, description, status, priority, due_date, completed, id, the list
  filters) is bound as a `?` placeholder parameter in `better-sqlite3`, never
  concatenated into SQL text.
- **Allowlisted dynamic SQL fragments.** The only parts of a query built from
  request input that become literal SQL text are `sortBy` and `order` for
  the list endpoint. Both are validated twice: once by the Joi
  `taskListQuerySchema` (`.valid(...)` against a fixed list) at the HTTP
  layer, and again inside `task.model.js` (`assertSafeSortColumn`/
  `assertSafeOrder`) against the same hardcoded allowlist, so the model
  remains safe even if called directly.
- **Defense in depth at the schema level.** CHECK/NOT NULL constraints mean
  even a bug in application validation, or a direct database write, cannot
  introduce an invalid `status`, `priority`, `completed`, or empty `title`.
- **Unknown fields rejected.** Every Joi schema uses `.unknown(false)`, so
  unexpected body/query fields are a validation error instead of being
  silently ignored (or silently accepted and written).
- **No sensitive data in error responses.** See "Error handling" above.

## Testing

- Unit tests (`tests/unit/`) cover the task model directly (CRUD, filtering,
  pagination, sorting, the status/completed reconciliation rules, and
  SQL-injection-as-data) and the migration runner (fresh-database schema
  creation, idempotency, and the legacy-table upgrade path).
- Integration tests (`tests/integration/`) exercise the full Express app
  through Supertest across every endpoint, including validation edge cases,
  pagination/filtering, and error-response safety.
- Both use isolated SQLite files under `tests/tmp/`, reset table contents
  (and the `sqlite_sequence` autoincrement counter) between tests via
  `beforeEach`, and close + delete their database file in `afterAll` — so
  tests are deterministic and don't depend on run order or leftover state.
