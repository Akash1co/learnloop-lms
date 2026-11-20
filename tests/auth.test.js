process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const test = require('node:test');
const app = require('../server');
const { resetMemory } = require('../server/store');
const { resetRevokedTokens } = require('../server/middleware/auth');

let server;
let baseUrl;

test.before(async () => {
  resetMemory();
  resetRevokedTokens();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  return { response, body: await response.json() };
}

test('registers users and rejects invalid input', async () => {
  const created = await request('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Student', email: 'student@example.com', password: 'password123' }),
  });
  assert.equal(created.response.status, 201);
  assert.ok(created.body.token);
  assert.equal(created.body.user.role, 'student');

  const invalid = await request('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'X', email: 'not-an-email', password: 'short' }),
  });
  assert.equal(invalid.response.status, 422);
});

test('logs in and rejects a wrong password', async () => {
  const result = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'student@example.com', password: 'password123' }),
  });
  assert.equal(result.response.status, 200);
  assert.ok(result.body.token);

  const wrong = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'student@example.com', password: 'wrong-password' }),
  });
  assert.equal(wrong.response.status, 401);
});

test('enforces course RBAC and permits instructors', async () => {
  const instructor = await request('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Instructor', email: 'instructor@example.com', password: 'password123', role: 'instructor',
    }),
  });
  const student = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'student@example.com', password: 'password123' }),
  });
  const studentAttempt = await request('/api/v1/courses', {
    method: 'POST',
    headers: { authorization: `Bearer ${student.body.token}` },
    body: JSON.stringify({ title: 'Unauthorized course' }),
  });
  assert.equal(studentAttempt.response.status, 403);

  const created = await request('/api/v1/courses', {
    method: 'POST',
    headers: { authorization: `Bearer ${instructor.body.token}` },
    body: JSON.stringify({
      title: 'Node.js Foundations',
      description: 'A practical introduction to building Node.js applications.',
    }),
  });
  assert.equal(created.response.status, 201);
  const listed = await request('/api/v1/courses', {
    headers: { authorization: `Bearer ${student.body.token}` },
  });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.courses.length, 1);
});

test('revokes a token on logout', async () => {
  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'student@example.com', password: 'password123' }),
  });
  const headers = { authorization: `Bearer ${login.body.token}` };
  const logout = await request('/api/v1/auth/logout', { method: 'POST', headers });
  assert.equal(logout.response.status, 200);
  const reused = await request('/api/v1/courses', { headers });
  assert.equal(reused.response.status, 401);
});
