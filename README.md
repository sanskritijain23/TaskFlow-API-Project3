# TaskFlow API

TaskFlow API is a RESTful backend application for managing tasks, built with
Node.js, Express, and SQLite. It provides complete CRUD operations backed by
a constrained relational schema, request validation, filtering/pagination/
sorting, centralized error handling, a versioned database migration system,
and automated tests.

## Project 3 Objective

This is the **Project 3: Database Integration** milestone of the DecodeLabs
Full Stack Development Industrial Training Kit. It upgrades a working
Express + SQLite task API into a submission-ready deliverable that
demonstrates:

- Relational database schema design (with primary keys and constraints)
- Backend-to-database integration via parameterized queries
- Full CRUD over a RESTful API
- Data validation at both the application (Joi) and database (SQL CHECK)
  layers
- SQL injection prevention
- A safe, versioned migration mechanism
- Automated, deterministic tests
- Clear technical documentation

## Features

- Health check endpoint
- Full CRUD for tasks, including a full-replacement `PUT` and a
  partial-update `PATCH`
- A `tasks` schema with `status`, `priority`, `due_date`, and `completed`,
  each enforced by database-level `CHECK`/`NOT NULL` constraints
- Filtering, pagination, and sorting on the list endpoint, with an
  allowlisted set of sortable columns
- Automatic, consistent `status` ⇄ `completed` reconciliation (see below)
- A versioned migration system that creates the schema on a fresh database
  and safely upgrades a pre-existing (legacy) database file
- Centralized error handling that never leaks SQL text, stack traces, or
  file paths
- Unit + integration test suite (Jest + Supertest) with isolated,
  deterministic test databases
- A Postman collection and a `requests.http` file for manual verification

## Technology Stack

- Node.js (CommonJS)
- Express.js
- better-sqlite3 (SQLite)
- Joi (validation)
- Morgan (request logging)
- Jest + Supertest (testing)
- ESLint (linting)

## Folder Structure

```text
taskflow-api/
├── server.js                    # Entry point: env, DB init, HTTP server, graceful shutdown
├── package.json
├── .env.example
├── README.md
├── ARCHITECTURE.md
├── DATABASE_DESIGN.md
├── requests.http                # Manual REST Client requests
├── migrations/                  # Versioned schema migrations
│   ├── 001_create_schema_migrations_table.js
│   ├── 002_create_tasks_table.js
│   └── 003_upgrade_legacy_tasks_table.js
├── scripts/
│   └── migrate.js               # Standalone `npm run db:migrate` CLI
├── postman/
│   └── TaskFlow-API.postman_collection.json
├── src/
│   ├── app.js                   # Express app setup
│   ├── config/
│   │   └── database.js          # SQLite connection + migration bootstrap
│   ├── db/
│   │   └── migrator.js          # Migration runner
│   ├── controllers/
│   │   └── task.controller.js
│   ├── middleware/
│   │   ├── validation.js
│   │   └── errorHandler.js
│   ├── models/
│   │   └── task.model.js        # All SQL lives here
│   ├── routes/
│   │   └── task.routes.js
│   ├── utils/
│   │   └── reconcileTaskState.js
│   └── validators/
│       └── task.validator.js
├── tests/
│   ├── unit/
│   │   ├── task.model.test.js
│   │   └── migrator.test.js
│   └── integration/
│       └── task.api.test.js
└── database/                    # Local dev SQLite file lives here (gitignored)
```

## Prerequisites

- **Node.js 24 LTS** (required — see `engines` in `package.json`; `better-sqlite3` ships prebuilt native binaries for Node 24 on Windows/macOS/Linux x64/arm64, so no C++ build toolchain such as Visual Studio Build Tools is needed to install this project)
- npm 10+

## Installation

```bash
git clone https://github.com/sanskritijain23/TaskFlow-API.git
cd TaskFlow-API
npm install
```

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

```env
PORT=3000
NODE_ENV=development
DB_PATH=./database/tasks.db
```

| Variable   | Description                                   | Default                |
|------------|------------------------------------------------|-------------------------|
| `PORT`     | HTTP port the server listens on                 | `3000`                  |
| `NODE_ENV` | `development`, `test`, or `production`          | `development`           |
| `DB_PATH`  | Path to the SQLite database file                | `./database/tasks.db`   |

Tests always override `DB_PATH` to a file under `tests/tmp/` before touching
the database, so running tests never reads or writes your development
database (see "Database Initialization & Migrations" and `ARCHITECTURE.md`).

## Database Initialization / Migrations

The database schema is created and kept up to date by a small, versioned
migration system in `migrations/`, run by `src/db/migrator.js`.

- **Automatic**: `npm start`, `npm run dev`, and the test suite all call
  `initializeDatabase()`, which opens the configured `DB_PATH` and runs any
  pending migrations before the server (or tests) start handling requests.
  You do not need to run anything manually for a fresh clone to work.
- **Manual / explicit**: you can also run migrations independently of the
  server:

  ```bash
  npm run db:migrate
  ```

  This is safe to run repeatedly — on an already-up-to-date database it's a
  no-op — and is exactly what a deploy step would call before starting the
  app.
- **Upgrading an existing database file**: if `DB_PATH` points at a SQLite
  file created by a pre-Project-3 version of this app (missing `status`,
  `priority`, `due_date`), the migration system detects this automatically
  and rebuilds the `tasks` table in place, preserving every existing row
  (backfilling `status` from the old `completed` flag and defaulting
  `priority` to `medium`). No data is lost. See `DATABASE_DESIGN.md` for the
  full schema and `ARCHITECTURE.md` for how the migration runner works.

## Run Commands

```bash
npm start      # production-style start
npm run dev    # nodemon, restarts on file changes
```

The server logs `TaskFlow API running on port <PORT>` once it's ready, and
responds on `GET /api/health`.

## Test Commands

```bash
npm test               # run the full test suite once
npm run test:watch     # watch mode
npm run test:coverage  # run with coverage report
```

## Lint Commands

```bash
npm run lint
```

## API Endpoints

| Method | Endpoint               | Description                          |
|--------|-------------------------|---------------------------------------|
| GET    | `/api/health`           | Health check                          |
| GET    | `/api/v1/tasks`         | List tasks (filter/paginate/sort)     |
| GET    | `/api/v1/tasks/:id`     | Get one task                          |
| POST   | `/api/v1/tasks`         | Create a task                         |
| PUT    | `/api/v1/tasks/:id`     | Full replacement update               |
| PATCH  | `/api/v1/tasks/:id`     | Partial update                        |
| DELETE | `/api/v1/tasks/:id`     | Delete a task                         |

### PUT vs PATCH

- **PUT** performs a full replacement of every editable field. `title`,
  `status`, `priority`, `due_date`, and `completed` are all **required** in
  the request body (`description` and `due_date` may be explicitly `null`,
  but must be present). Fields you don't send are **not** carried over —
  this is what makes it a true replacement rather than a partial update.
- **PATCH** updates only the fields you send. Every field is optional, but
  the body must contain **at least one** field — an empty PATCH body is
  rejected with `400`.
- Both reject unknown fields and reject an empty body.

## Filtering, Pagination, and Sorting

`GET /api/v1/tasks` accepts the following query parameters, all optional:

| Parameter   | Type    | Notes                                                          |
|-------------|---------|------------------------------------------------------------------|
| `status`    | string  | one of `pending`, `in_progress`, `completed`                     |
| `priority`  | string  | one of `low`, `medium`, `high`                                   |
| `completed` | boolean | `true` / `false`                                                  |
| `page`      | integer | 1-indexed, defaults to `1`                                        |
| `limit`     | integer | defaults to `10`, max `100`                                       |
| `sortBy`    | string  | one of `id`, `title`, `status`, `priority`, `due_date`, `created_at`, `updated_at` |
| `order`     | string  | `asc` or `desc`, defaults to `desc`                                |

Any other query parameter, or an invalid value for one of the above, returns
`400`. `sortBy`/`order` are validated against a hardcoded allowlist both at
the HTTP layer and again inside the model layer before being used to build
SQL — see `ARCHITECTURE.md` → "Security decisions".

Example:

```bash
GET /api/v1/tasks?status=pending&priority=high&page=1&limit=10&sortBy=due_date&order=asc
```

```json
{
  "success": true,
  "data": [
    {
      "id": 4,
      "title": "Ship the release",
      "description": null,
      "status": "pending",
      "priority": "high",
      "due_date": "2026-08-10T00:00:00.000Z",
      "completed": false,
      "created_at": "2026-07-28T09:12:00.000Z",
      "updated_at": "2026-07-28T09:12:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

## Status / Completed Consistency

`status` and `completed` describe the same underlying fact, so the API keeps
them in sync automatically and rejects genuine contradictions:

- If you send **both** fields and they disagree (e.g.
  `{"status": "pending", "completed": true}`), the request is rejected with
  `400`.
- If you send **only `completed`**: `completed: true` sets `status` to
  `completed`; `completed: false` resets `status` away from `completed`
  (to `pending`) if it was previously `completed`.
- If you send **only `status`**: `status: "completed"` sets `completed` to
  `true`; any other status sets `completed` to `false`.
- If you send **neither**, nothing about the other field changes.

This logic lives in `src/utils/reconcileTaskState.js` and is covered by both
unit and integration tests.

## Request / Response Examples

Create a task:

```json
POST /api/v1/tasks
{
  "title": "Finish API tests",
  "description": "Cover task endpoints",
  "priority": "high",
  "due_date": "2026-08-15"
}
```

```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "Finish API tests",
    "description": "Cover task endpoints",
    "status": "pending",
    "priority": "high",
    "due_date": "2026-08-15T00:00:00.000Z",
    "completed": false,
    "created_at": "2026-07-30T10:00:00.000Z",
    "updated_at": "2026-07-30T10:00:00.000Z"
  }
}
```

Partial update:

```json
PATCH /api/v1/tasks/1
{
  "completed": true
}
```

```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "Finish API tests",
    "description": "Cover task endpoints",
    "status": "completed",
    "priority": "high",
    "due_date": "2026-08-15T00:00:00.000Z",
    "completed": true,
    "created_at": "2026-07-30T10:00:00.000Z",
    "updated_at": "2026-07-30T10:05:00.000Z"
  }
}
```

List response shape:

```json
{
  "success": true,
  "data": [ /* array of task objects */ ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalItems": 25,
    "totalPages": 3
  }
}
```

Delete returns `204 No Content` with no response body.

## Error Response Format

Every error response has the same shape:

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "details": [
      { "field": "title", "message": "title is required and cannot be empty or whitespace-only" }
    ]
  }
}
```

`details` is only present for validation errors. Unexpected server-side
errors (e.g. a database problem) always return a generic
`{ "success": false, "error": { "message": "Internal Server Error" } }` with
HTTP `500` — see "Database Persistence & Error Safety" below.

## HTTP Status Codes

| Code | Meaning                                              |
|------|--------------------------------------------------------|
| 200  | Successful read or update                              |
| 201  | Task created                                            |
| 204  | Task deleted                                             |
| 400  | Validation error (bad body, bad query, bad id)          |
| 404  | Task or route not found                                  |
| 500  | Unexpected server error                                   |

## Database Persistence & Error Safety

Tasks are persisted in a SQLite file at `DB_PATH` (WAL journal mode is
enabled for better concurrent read/write behavior). Data survives server
restarts and reconnections — this is covered directly by an automated test
that closes and reopens the database connection mid-test and confirms the
data is still there.

Errors that originate from the database layer (for example, a constraint
violation, or a raw `better-sqlite3` exception that might otherwise include
SQL text or a file path in its message) are never returned to the client
as-is. The central error handler (`src/middleware/errorHandler.js`) only
forwards messages from errors we throw ourselves with a `< 500` status code;
everything else becomes a generic `500 Internal Server Error`, with the full
error logged server-side only in local development (never in `test` or
`production`).

## SQL Injection Protection

Every value that comes from the client — task fields, the `:id` route
parameter, and every list-endpoint query parameter — is bound as a `?`
placeholder parameter through `better-sqlite3`'s prepared statements. None of
it is ever concatenated into SQL text. The only request-derived values that
become part of the literal SQL text are `sortBy` and `order` for the list
endpoint's `ORDER BY` clause, and both are checked against a fixed,
hardcoded allowlist of valid column names/directions before use — first by
Joi at the HTTP layer, and again independently inside the model layer, so
the protection holds even if the model is called directly. This is verified
by an automated test that submits a classic `'; DROP TABLE tasks;--`-style
payload as a task title and confirms it is stored as inert text data, and by
tests that attempt to pass an injection payload as `sortBy` and confirm it
is rejected outright.

## Known Limitations

- Single-table schema — no relations, no user accounts, no authentication
  (out of scope for Project 3 by design).
- SQLite is a single-file, single-writer database; this is appropriate for
  this project's scope but wouldn't be the right choice for high-concurrency
  multi-writer production workloads.
- `due_date` is date/time-only; there's no timezone-aware scheduling.
- No soft-delete — `DELETE` is permanent.

## Future Improvements

- Add user accounts and per-user task ownership.
- Add task tags/categories (would introduce a proper relational join table).
- Add full-text search over `title`/`description`.
- Add rate limiting and request size limits at the Express layer.
- Add OpenAPI/Swagger documentation generated from the Joi schemas.

## Author

Sanskriti Jain
