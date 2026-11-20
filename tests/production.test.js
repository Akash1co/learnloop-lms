process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const app = require('../server');
const postmanCollection = require('../docs/LearnLoop_LMS.postman_collection.json');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test('health endpoint reports service status and security headers', async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.environment, 'test');
  assert.equal(body.service, 'LearnLoop LMS API');
  assert.ok(body.uptime >= 0);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(response.headers.get('x-frame-options'));

  const versioned = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(versioned.status, 200);
  assert.equal((await versioned.json()).status, 'ok');
});

test('serves Swagger UI and OpenAPI documentation', async () => {
  const page = await fetch(`${baseUrl}/api/docs`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /SwaggerUIBundle/);
  assert.match(html, /\/api\/docs\/openapi\.json/);

  const specResponse = await fetch(`${baseUrl}/api/docs/openapi.json`);
  const spec = await specResponse.json();
  assert.equal(specResponse.status, 200);
  assert.equal(spec.openapi, '3.0.3');
  assert.ok(spec.components.securitySchemes.BearerAuth);
  assert.ok(spec.paths['/api/v1/auth/register']);
  assert.ok(spec.paths['/api/v1/integrations/payments/checkout']);
  assert.ok(spec.paths['/api/v1/dashboard']);
  assert.equal(postmanCollection.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  assert.ok(postmanCollection.variable.some((variable) => variable.key === 'baseUrl'));
  assert.ok(postmanCollection.variable.some((variable) => variable.key === 'token'));
});

test('requires a strong JWT secret in production', () => {
  const script = "require('./server/middleware/security').assertProductionSecrets()";
  const baseEnvironment = { ...process.env, NODE_ENV: 'production' };
  for (const secret of ['', 'short', 'replace-with-a-long-random-secret', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']) {
    assert.throws(() => execFileSync(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      env: { ...baseEnvironment, JWT_SECRET: secret },
      stdio: 'pipe',
    }));
  }
  assert.doesNotThrow(() => execFileSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    env: { ...baseEnvironment, JWT_SECRET: 'U7n$gL3xV8@pQ2m!zR5wK9b#cT4yH6dA' },
    stdio: 'pipe',
  }));
});

test('rejects invalid registration input and rate-limits authentication attempts', async () => {
  const sanitized = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.39',
    },
    body: JSON.stringify({ name: 'Clean\u0000 Name', email: 'clean@example.test', password: 'secure-password-123' }),
  });
  assert.equal(sanitized.status, 201);

  const invalid = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.40',
    },
    body: JSON.stringify({ name: 'X', email: 'not-an-email', password: 'short' }),
  });
  assert.equal(invalid.status, 422);

  const headers = {
    'content-type': 'application/json',
    'x-forwarded-for': '198.51.100.41',
  };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'unknown@example.test', password: 'not-a-real-password' }),
    });
    assert.equal(response.status, 401);
  }
  const limited = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: 'unknown@example.test', password: 'not-a-real-password' }),
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});
