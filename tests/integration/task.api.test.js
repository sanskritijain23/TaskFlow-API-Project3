const fs = require('fs');
const path = require('path');
const request = require('supertest');

const testDbPath = path.join(__dirname, '..', 'tmp', 'task-api-test.db');

process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const app = require('../../src/app');
const { initializeDatabase, getDatabase, closeDatabase } = require('../../src/config/database');

function resetTasks() {
  const db = getDatabase();
  db.prepare('DELETE FROM tasks').run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'tasks'").run();
}

async function createTask(overrides = {}) {
  const response = await request(app)
    .post('/api/v1/tasks')
    .send({ title: 'Default task', ...overrides });
  return response.body.data;
}

describe('task api', () => {
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

  describe('health', () => {
    test('GET /api/health returns 200', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: 'TaskFlow API is running' });
    });
  });

  describe('creation', () => {
    test('valid task creation returns 201 with defaults applied', async () => {
      const response = await request(app).post('/api/v1/tasks').send({
        title: 'Create task',
        description: 'A description',
        priority: 'high',
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: 1,
        title: 'Create task',
        description: 'A description',
        status: 'pending',
        priority: 'high',
        completed: false,
      });
    });

    test('missing title returns 400', async () => {
      const response = await request(app).post('/api/v1/tasks').send({ description: 'No title' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'title' })])
      );
    });

    test('whitespace-only title returns 400', async () => {
      const response = await request(app).post('/api/v1/tasks').send({ title: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('invalid status returns 400', async () => {
      const response = await request(app)
        .post('/api/v1/tasks')
        .send({ title: 'Bad status', status: 'archived' });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'status' })])
      );
    });

    test('invalid priority returns 400', async () => {
      const response = await request(app)
        .post('/api/v1/tasks')
        .send({ title: 'Bad priority', priority: 'urgent' });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'priority' })])
      );
    });

    test('invalid due date returns 400', async () => {
      const response = await request(app)
        .post('/api/v1/tasks')
        .send({ title: 'Bad date', due_date: 'not-a-date' });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'due_date' })])
      );
    });

    test('unknown field returns 400', async () => {
      const response = await request(app)
        .post('/api/v1/tasks')
        .send({ title: 'Task', extraField: 'nope' });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'extraField' })])
      );
    });

    test('contradictory status/completed combination returns 400', async () => {
      const response = await request(app)
        .post('/api/v1/tasks')
        .send({ title: 'Contradiction', status: 'pending', completed: true });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('reading', () => {
    test('empty list returns 200 with an empty array and zeroed pagination', async () => {
      const response = await request(app).get('/api/v1/tasks');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.pagination).toEqual({ page: 1, limit: 10, totalItems: 0, totalPages: 0 });
    });

    test('populated list returns 200', async () => {
      await createTask({ title: 'List task' });

      const response = await request(app).get('/api/v1/tasks');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });

    test('fetch existing task returns 200', async () => {
      const created = await createTask({ title: 'Find task', completed: true });

      const response = await request(app).get(`/api/v1/tasks/${created.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: created.id,
        title: 'Find task',
        completed: true,
      });
    });

    test('fetch missing task returns 404', async () => {
      const response = await request(app).get('/api/v1/tasks/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: { message: 'Task not found' },
      });
    });

    test('invalid id returns 400', async () => {
      const response = await request(app).get('/api/v1/tasks/not-a-number');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('updating', () => {
    test('valid PUT fully replaces a task', async () => {
      const created = await createTask({ title: 'Before update', priority: 'low' });

      const response = await request(app).put(`/api/v1/tasks/${created.id}`).send({
        title: 'After update',
        description: null,
        status: 'in_progress',
        priority: 'high',
        due_date: null,
        completed: false,
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: created.id,
        title: 'After update',
        description: null,
        status: 'in_progress',
        priority: 'high',
        completed: false,
      });
    });

    test('PUT missing a required field returns 400', async () => {
      const created = await createTask();

      const response = await request(app).put(`/api/v1/tasks/${created.id}`).send({
        description: null,
        status: 'in_progress',
        priority: 'high',
        due_date: null,
        completed: false,
        // title intentionally omitted
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'title' })])
      );
    });

    test('PUT with an empty body returns 400', async () => {
      const created = await createTask();
      const response = await request(app).put(`/api/v1/tasks/${created.id}`).send({});

      expect(response.status).toBe(400);
    });

    test('valid partial PATCH updates only the given fields', async () => {
      const created = await createTask({ title: 'Patch me', priority: 'low' });

      const response = await request(app)
        .patch(`/api/v1/tasks/${created.id}`)
        .send({ priority: 'high' });

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe('Patch me');
      expect(response.body.data.priority).toBe('high');
    });

    test('empty PATCH body returns 400', async () => {
      const created = await createTask();
      const response = await request(app).patch(`/api/v1/tasks/${created.id}`).send({});

      expect(response.status).toBe(400);
    });

    test('contradictory status/completed values in PATCH return 400', async () => {
      const created = await createTask();

      const response = await request(app)
        .patch(`/api/v1/tasks/${created.id}`)
        .send({ status: 'completed', completed: false });

      expect(response.status).toBe(400);
    });

    test('PUT on a missing task returns 404', async () => {
      const response = await request(app).put('/api/v1/tasks/999').send({
        title: 'Missing',
        description: null,
        status: 'pending',
        priority: 'medium',
        due_date: null,
        completed: false,
      });

      expect(response.status).toBe(404);
    });

    test('PATCH on a missing task returns 404', async () => {
      const response = await request(app).patch('/api/v1/tasks/999').send({ title: 'Missing' });

      expect(response.status).toBe(404);
    });

    test('unknown fields in PUT/PATCH are rejected', async () => {
      const created = await createTask();

      const putResponse = await request(app).put(`/api/v1/tasks/${created.id}`).send({
        title: 'x',
        description: null,
        status: 'pending',
        priority: 'medium',
        due_date: null,
        completed: false,
        notAField: true,
      });
      const patchResponse = await request(app)
        .patch(`/api/v1/tasks/${created.id}`)
        .send({ notAField: true });

      expect(putResponse.status).toBe(400);
      expect(patchResponse.status).toBe(400);
    });
  });

  describe('deletion', () => {
    test('delete existing task returns 204', async () => {
      const created = await createTask({ title: 'Delete task' });

      const response = await request(app).delete(`/api/v1/tasks/${created.id}`);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
    });

    test('delete missing task returns 404', async () => {
      const response = await request(app).delete('/api/v1/tasks/999');
      expect(response.status).toBe(404);
    });

    test('deleted task is no longer retrievable', async () => {
      const created = await createTask({ title: 'Delete task' });

      await request(app).delete(`/api/v1/tasks/${created.id}`);
      const lookup = await request(app).get(`/api/v1/tasks/${created.id}`);

      expect(lookup.status).toBe(404);
    });
  });

  describe('filtering and pagination', () => {
    beforeEach(async () => {
      await createTask({ title: 'A', status: 'pending', priority: 'low', completed: false });
      await createTask({ title: 'B', status: 'in_progress', priority: 'medium', completed: false });
      await createTask({ title: 'C', status: 'completed', priority: 'high', completed: true });
    });

    test('filters by status', async () => {
      const response = await request(app).get('/api/v1/tasks').query({ status: 'in_progress' });

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('B');
    });

    test('filters by priority', async () => {
      const response = await request(app).get('/api/v1/tasks').query({ priority: 'high' });

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('C');
    });

    test('filters by completed', async () => {
      const response = await request(app).get('/api/v1/tasks').query({ completed: 'true' });

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('C');
    });

    test('returns pagination metadata', async () => {
      const response = await request(app).get('/api/v1/tasks').query({ page: 1, limit: 2 });

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({ page: 1, limit: 2, totalItems: 3, totalPages: 2 });
    });

    test('sorts results by the requested column and order', async () => {
      const response = await request(app)
        .get('/api/v1/tasks')
        .query({ sortBy: 'title', order: 'asc' });

      expect(response.body.data.map((t) => t.title)).toEqual(['A', 'B', 'C']);
    });

    test('invalid query parameters return 400', async () => {
      const response = await request(app).get('/api/v1/tasks').query({ status: 'bogus' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('invalid sortBy is rejected rather than silently ignored', async () => {
      const response = await request(app)
        .get('/api/v1/tasks')
        .query({ sortBy: 'password; DROP TABLE tasks;--' });

      expect(response.status).toBe(400);
    });
  });

  describe('persistence and security', () => {
    test('data persists across database connection reinitialization', async () => {
      await createTask({ title: 'Persisted task' });

      closeDatabase();
      initializeDatabase();

      const response = await request(app).get('/api/v1/tasks');
      expect(response.body.data.some((t) => t.title === 'Persisted task')).toBe(true);
    });

    test('SQL injection-style values are stored or rejected as data, never executed', async () => {
      const maliciousTitle = "'); DROP TABLE tasks; --";

      const createResponse = await request(app)
        .post('/api/v1/tasks')
        .send({ title: maliciousTitle });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.data.title).toBe(maliciousTitle);

      // The tasks table must still exist and be queryable afterwards.
      const listResponse = await request(app).get('/api/v1/tasks');
      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data.length).toBeGreaterThan(0);
    });

    test('error responses never leak SQL text, stack traces, or file paths', async () => {
      const response = await request(app).get('/api/v1/tasks/not-a-number');

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(/SELECT|INSERT|UPDATE|DELETE FROM/i);
      expect(serialized).not.toMatch(/\/home\/|\/mnt\/|\.js:\d+/);
    });

    test('development and test databases are isolated by DB_PATH', () => {
      const defaultDevPath = path.join(process.cwd(), 'database', 'tasks.db');
      expect(path.resolve(process.env.DB_PATH)).not.toBe(path.resolve(defaultDevPath));
      expect(process.env.DB_PATH).toContain(path.join('tests', 'tmp'));
    });
  });
});
