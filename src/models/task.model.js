'use strict';

const { getDatabase } = require('../config/database');
const { reconcileStatusAndCompleted } = require('../utils/reconcileTaskState');
const { SORTABLE_COLUMNS, ORDER_VALUES } = require('../validators/task.validator');

const DEFAULT_STATUS = 'pending';
const DEFAULT_PRIORITY = 'medium';

function toIsoStringOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function mapTask(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    due_date: row.due_date,
    completed: Boolean(row.completed),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function assertSafeSortColumn(sortBy) {
  if (!SORTABLE_COLUMNS.includes(sortBy)) {
    throw new Error(`Unsupported sort column: ${sortBy}`);
  }
}

function assertSafeOrder(order) {
  if (!ORDER_VALUES.includes(order)) {
    throw new Error(`Unsupported sort order: ${order}`);
  }
}

function getTaskById(id) {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return mapTask(row);
}

function createTask(taskData) {
  const db = getDatabase();

  const merged = {
    title: taskData.title,
    description: taskData.description ?? null,
    status: taskData.status ?? DEFAULT_STATUS,
    priority: taskData.priority ?? DEFAULT_PRIORITY,
    due_date: toIsoStringOrNull(taskData.due_date),
    completed: taskData.completed ?? false,
  };

  reconcileStatusAndCompleted(taskData, merged);

  const result = db
    .prepare(
      `INSERT INTO tasks (title, description, status, priority, due_date, completed)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      merged.title,
      merged.description,
      merged.status,
      merged.priority,
      merged.due_date,
      merged.completed ? 1 : 0
    );

  return getTaskById(result.lastInsertRowid);
}

/**
 * Full replacement update (PUT). Every editable field is taken from
 * taskData; nothing is carried over from the existing row except id,
 * created_at, and (implicitly) updated_at, which the DB trigger manages.
 */
function replaceTask(id, taskData) {
  const db = getDatabase();
  const existing = getTaskById(id);

  if (!existing) {
    return null;
  }

  const merged = {
    title: taskData.title,
    description: taskData.description ?? null,
    status: taskData.status,
    priority: taskData.priority,
    due_date: toIsoStringOrNull(taskData.due_date),
    completed: taskData.completed,
  };

  reconcileStatusAndCompleted(taskData, merged);

  db.prepare(
    `UPDATE tasks
     SET title = ?, description = ?, status = ?, priority = ?, due_date = ?, completed = ?
     WHERE id = ?`
  ).run(
    merged.title,
    merged.description,
    merged.status,
    merged.priority,
    merged.due_date,
    merged.completed ? 1 : 0,
    id
  );

  return getTaskById(id);
}

/**
 * Partial update (PATCH). Only fields present in taskData are changed;
 * everything else is preserved from the existing row. status/completed are
 * reconciled against the fields explicitly present in this request.
 */
function patchTask(id, taskData) {
  const db = getDatabase();
  const existing = getTaskById(id);

  if (!existing) {
    return null;
  }

  const merged = {
    title: Object.prototype.hasOwnProperty.call(taskData, 'title') ? taskData.title : existing.title,
    description: Object.prototype.hasOwnProperty.call(taskData, 'description')
      ? taskData.description
      : existing.description,
    status: Object.prototype.hasOwnProperty.call(taskData, 'status') ? taskData.status : existing.status,
    priority: Object.prototype.hasOwnProperty.call(taskData, 'priority')
      ? taskData.priority
      : existing.priority,
    due_date: Object.prototype.hasOwnProperty.call(taskData, 'due_date')
      ? toIsoStringOrNull(taskData.due_date)
      : existing.due_date,
    completed: Object.prototype.hasOwnProperty.call(taskData, 'completed')
      ? taskData.completed
      : existing.completed,
  };

  reconcileStatusAndCompleted(taskData, merged);

  db.prepare(
    `UPDATE tasks
     SET title = ?, description = ?, status = ?, priority = ?, due_date = ?, completed = ?
     WHERE id = ?`
  ).run(
    merged.title,
    merged.description,
    merged.status,
    merged.priority,
    merged.due_date,
    merged.completed ? 1 : 0,
    id
  );

  return getTaskById(id);
}

function deleteTask(id) {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Filtered, paginated, sorted list of tasks.
 *
 * All user-controlled *values* (status, priority, completed, page, limit)
 * are passed as bound parameters, never concatenated into the SQL string.
 * The only pieces of the query built from request input that get spliced
 * directly into the SQL text are `sortBy` and `order`, and both are
 * re-validated here against a hardcoded allowlist before use, so no
 * attacker-controlled string ever reaches the query text.
 */
function getTasks(filters) {
  const db = getDatabase();

  const sortBy = filters.sortBy || 'created_at';
  const order = (filters.order || 'desc').toLowerCase();
  assertSafeSortColumn(sortBy);
  assertSafeOrder(order);

  const conditions = [];
  const params = [];

  if (filters.status !== undefined) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.priority !== undefined) {
    conditions.push('priority = ?');
    params.push(filters.priority);
  }
  if (filters.completed !== undefined) {
    conditions.push('completed = ?');
    params.push(filters.completed ? 1 : 0);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 ? filters.limit : 10;
  const offset = (page - 1) * limit;

  const totalItems = db
    .prepare(`SELECT COUNT(*) AS count FROM tasks ${whereClause}`)
    .get(...params).count;

  const rows = db
    .prepare(
      `SELECT * FROM tasks ${whereClause} ORDER BY ${sortBy} ${order} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return {
    tasks: rows.map(mapTask),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
    },
  };
}

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  replaceTask,
  patchTask,
  deleteTask,
};
