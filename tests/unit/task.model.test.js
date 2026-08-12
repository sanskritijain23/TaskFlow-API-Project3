const fs = require('fs');
const path = require('path');

const testDbPath = path.join(__dirname, '..', 'tmp', 'task-model-test.db');

process.env.DB_PATH = testDbPath;

const { initializeDatabase, getDatabase, closeDatabase } = require('../../src/config/database');
const taskModel = require('../../src/models/task.model');

function resetTasks() {
  const db = getDatabase();
  db.prepare('DELETE FROM tasks').run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'tasks'").run();
}

describe('task model', () => {
  beforeAll(() => {
    fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
    initializeDatabase();
  });

  beforeEach(() => {
    resetTasks();
  });

  afterAll(() => {
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('createTask', () => {
    test('creates and returns a task with defaults applied', () => {
      const task = taskModel.createTask({
        title: 'Write tests',
        description: 'Cover the task model',
      });

      expect(task).toMatchObject({
        id: 1,
        title: 'Write tests',
        description: 'Cover the task model',
        status: 'pending',
        priority: 'medium',
        due_date: null,
        completed: false,
      });
      expect(task.created_at).toBeDefined();
      expect(task.updated_at).toBeDefined();
    });

    test('auto-derives status "completed" when completed=true and status is not provided', () => {
      const task = taskModel.createTask({ title: 'Auto status', completed: true });
      expect(task.status).toBe('completed');
      expect(task.completed).toBe(true);
    });

    test('auto-derives completed=true when status is "completed" and completed is not provided', () => {
      const task = taskModel.createTask({ title: 'Auto completed', status: 'completed' });
      expect(task.status).toBe('completed');
      expect(task.completed).toBe(true);
    });

    test('rejects a contradictory status/completed combination', () => {
      expect(() =>
        taskModel.createTask({ title: 'Contradiction', status: 'pending', completed: true })
      ).toThrow(/contradictory/);
    });

    test('rejects an invalid status at the database layer even if validation is bypassed', () => {
      const db = getDatabase();
      expect(() =>
        db.prepare("INSERT INTO tasks (title, status) VALUES ('x', 'not_a_status')").run()
      ).toThrow();
    });
  });

  describe('getTasks (list, filter, paginate, sort)', () => {
    test('returns an empty list with zero pagination metadata when there are no tasks', () => {
      const result = taskModel.getTasks({ page: 1, limit: 10 });
      expect(result.tasks).toHaveLength(0);
      expect(result.pagination).toEqual({ page: 1, limit: 10, totalItems: 0, totalPages: 0 });
    });

    test('returns a populated list', () => {
      taskModel.createTask({ title: 'A' });
      taskModel.createTask({ title: 'B' });

      const result = taskModel.getTasks({ page: 1, limit: 10 });
      expect(result.tasks).toHaveLength(2);
    });

    test('filters by status', () => {
      taskModel.createTask({ title: 'Pending one', status: 'pending' });
      taskModel.createTask({ title: 'In progress one', status: 'in_progress' });

      const result = taskModel.getTasks({ status: 'in_progress', page: 1, limit: 10 });
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].title).toBe('In progress one');
    });

    test('filters by priority', () => {
      taskModel.createTask({ title: 'Low', priority: 'low' });
      taskModel.createTask({ title: 'High', priority: 'high' });

      const result = taskModel.getTasks({ priority: 'high', page: 1, limit: 10 });
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].title).toBe('High');
    });

    test('filters by completed', () => {
      taskModel.createTask({ title: 'Not done', completed: false });
      taskModel.createTask({ title: 'Done', completed: true });

      const result = taskModel.getTasks({ completed: true, page: 1, limit: 10 });
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].title).toBe('Done');
    });

    test('paginates results and reports correct metadata', () => {
      for (let i = 1; i <= 25; i += 1) {
        taskModel.createTask({ title: `Task ${i}` });
      }

      const page1 = taskModel.getTasks({ page: 1, limit: 10, sortBy: 'id', order: 'asc' });
      const page3 = taskModel.getTasks({ page: 3, limit: 10, sortBy: 'id', order: 'asc' });

      expect(page1.tasks).toHaveLength(10);
      expect(page1.pagination).toEqual({ page: 1, limit: 10, totalItems: 25, totalPages: 3 });
      expect(page3.tasks).toHaveLength(5);
    });

    test('sorts by the requested column and direction', () => {
      taskModel.createTask({ title: 'Charlie' });
      taskModel.createTask({ title: 'Alpha' });
      taskModel.createTask({ title: 'Bravo' });

      const ascending = taskModel.getTasks({ sortBy: 'title', order: 'asc', page: 1, limit: 10 });
      expect(ascending.tasks.map((t) => t.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    });

    test('rejects a sort column outside the allowlist even if called directly', () => {
      expect(() =>
        taskModel.getTasks({ sortBy: 'not_a_real_column; DROP TABLE tasks;--', page: 1, limit: 10 })
      ).toThrow();
    });

    test('rejects a sort order outside the allowlist even if called directly', () => {
      expect(() => taskModel.getTasks({ sortBy: 'id', order: 'sideways', page: 1, limit: 10 })).toThrow();
    });
  });

  describe('getTaskById', () => {
    test('returns one task with completed coerced to a boolean', () => {
      const created = taskModel.createTask({
        title: 'Read task',
        description: '',
        completed: true,
      });

      const task = taskModel.getTaskById(created.id);

      expect(task.title).toBe('Read task');
      expect(task.completed).toBe(true);
      expect(typeof task.completed).toBe('boolean');
    });

    test('returns null for a missing task', () => {
      expect(taskModel.getTaskById(999)).toBeNull();
    });
  });

  describe('replaceTask (PUT)', () => {
    test('fully replaces a task', () => {
      const created = taskModel.createTask({
        title: 'Old title',
        description: 'Old description',
        status: 'pending',
        priority: 'low',
        completed: false,
      });

      const updated = taskModel.replaceTask(created.id, {
        title: 'New title',
        description: null,
        status: 'in_progress',
        priority: 'high',
        due_date: null,
        completed: false,
      });

      expect(updated).toMatchObject({
        id: created.id,
        title: 'New title',
        description: null,
        status: 'in_progress',
        priority: 'high',
        completed: false,
      });
    });

    test('returns null for a missing task', () => {
      const result = taskModel.replaceTask(999, {
        title: 'Missing task',
        status: 'pending',
        priority: 'medium',
        due_date: null,
        completed: false,
      });

      expect(result).toBeNull();
    });
  });

  describe('patchTask (PATCH)', () => {
    test('partially updates only the provided fields', () => {
      const created = taskModel.createTask({
        title: 'Original',
        description: 'Original description',
        priority: 'low',
      });

      const patched = taskModel.patchTask(created.id, { priority: 'high' });

      expect(patched.title).toBe('Original');
      expect(patched.description).toBe('Original description');
      expect(patched.priority).toBe('high');
    });

    test('resets completed to false when status changes away from "completed" without touching completed', () => {
      const created = taskModel.createTask({ title: 'Was complete', status: 'completed' });
      expect(created.completed).toBe(true);

      const patched = taskModel.patchTask(created.id, { status: 'in_progress' });
      expect(patched.status).toBe('in_progress');
      expect(patched.completed).toBe(false);
    });

    test('resets status to "pending" when completed is set to false without touching status', () => {
      const created = taskModel.createTask({ title: 'Was complete', status: 'completed' });
      const patched = taskModel.patchTask(created.id, { completed: false });

      expect(patched.completed).toBe(false);
      expect(patched.status).toBe('pending');
    });

    test('rejects a contradictory patch', () => {
      const created = taskModel.createTask({ title: 'Task' });
      expect(() =>
        taskModel.patchTask(created.id, { status: 'completed', completed: false })
      ).toThrow(/contradictory/);
    });

    test('returns null for a missing task', () => {
      expect(taskModel.patchTask(999, { title: 'Missing' })).toBeNull();
    });
  });

  describe('deleteTask', () => {
    test('removes a task', () => {
      const created = taskModel.createTask({ title: 'Delete task' });

      expect(taskModel.deleteTask(created.id)).toBe(true);
      expect(taskModel.getTaskById(created.id)).toBeNull();
    });

    test('returns false for a missing task', () => {
      expect(taskModel.deleteTask(999)).toBe(false);
    });
  });

  describe('persistence', () => {
    test('data persists across database connection reinitialization', () => {
      taskModel.createTask({ title: 'Persisted task' });

      closeDatabase();
      initializeDatabase();

      const tasks = taskModel.getTasks({ page: 1, limit: 10 }).tasks;
      expect(tasks.some((t) => t.title === 'Persisted task')).toBe(true);
    });

    test('SQL injection-style values are stored as inert data, never executed', () => {
      const maliciousTitle = "Robert'); DROP TABLE tasks;--";
      const created = taskModel.createTask({ title: maliciousTitle });

      expect(created.title).toBe(maliciousTitle);

      // If the payload had been executed, the tasks table would be gone.
      const db = getDatabase();
      const tableInfo = db.prepare('PRAGMA table_info(tasks)').all();
      expect(tableInfo.length).toBeGreaterThan(0);

      const fetched = taskModel.getTaskById(created.id);
      expect(fetched.title).toBe(maliciousTitle);
    });
  });
});
