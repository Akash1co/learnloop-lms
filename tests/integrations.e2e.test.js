process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const test = require('node:test');
const app = require('../server');
const { resetMemory } = require('../server/store');
const { resetRevokedTokens } = require('../server/middleware/auth');
const { getSentMessages, resetSentMessages } = require('../server/services/emailService');
const { createSignature } = require('../server/services/paymentService');
const { MAX_FILE_SIZE, removeAsset } = require('../server/services/storageService');

let server;
let baseUrl;
const uploadedAssets = [];

test.before(async () => {
  resetMemory();
  resetRevokedTokens();
  resetSentMessages();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await Promise.all(uploadedAssets.map((asset) => removeAsset(asset.filename, asset.isPublic)));
});

async function request(path, { token, ...options } = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers['content-type']) {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`${options.method || 'GET'} ${path} returned non-JSON ${response.status}: ${text.slice(0, 160)}`);
  }
  return { response, body };
}

async function register(name, email, role) {
  const result = await request('/api/v1/auth/register', {
    method: 'POST',
    body: { name, email, password: 'secure-password-123', role },
  });
  assert.equal(result.response.status, 201);
  return result.body;
}

async function upload(token, bytes, mimeType, filename) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), filename);
  const result = await request('/api/v1/integrations/uploads', { method: 'POST', token, body: form });
  if (result.body.asset) uploadedAssets.push(result.body.asset);
  return result;
}

test('completes paid course journey and dispatches email notifications', async () => {
  const instructor = await register('Instructor User', 'teacher@example.test', 'instructor');
  const student = await register('Student User', 'learner@example.test', 'student');

  const createdCourse = await request('/api/v1/courses', {
    method: 'POST',
    token: instructor.token,
    body: { title: 'Paid Node Course', description: 'Hands-on lessons', price: 29.99 },
  });
  assert.equal(createdCourse.response.status, 201);
  const courseId = createdCourse.body.course.id;

  const createdModule = await request(`/api/v1/courses/${courseId}/modules`, {
    method: 'POST',
    token: instructor.token,
    body: { title: 'Getting Started' },
  });
  assert.equal(createdModule.response.status, 201);
  const createdLesson = await request(`/api/v1/modules/${createdModule.body.module.id}/lessons`, {
    method: 'POST',
    token: instructor.token,
    body: { title: 'First Assignment', content: 'Build a small app' },
  });
  assert.equal(createdLesson.response.status, 201);
  const lessonId = createdLesson.body.lesson.id;

  const course = await request(`/api/v1/courses/${courseId}`, { token: student.token });
  assert.equal(course.response.status, 200);
  assert.equal(course.body.course.modules[0].lessons[0].id, lessonId);

  const checkout = await request('/api/v1/integrations/payments/checkout', {
    method: 'POST',
    token: student.token,
    body: { courseId },
  });
  assert.equal(checkout.response.status, 201);
  assert.equal(checkout.body.order.amount, 29.99);
  const orderId = checkout.body.order.provider_order_id;
  const paymentId = checkout.body.checkout.paymentId;
  const invalidVerification = await request('/api/v1/integrations/payments/verify', {
    method: 'POST',
    token: student.token,
    body: { orderId, paymentId, signature: 'invalid' },
  });
  assert.equal(invalidVerification.response.status, 400);
  const verified = await request('/api/v1/integrations/payments/verify', {
    method: 'POST',
    token: student.token,
    body: { orderId, paymentId, signature: createSignature(orderId, paymentId) },
  });
  assert.equal(verified.response.status, 200);
  assert.equal(verified.body.payment.status, 'paid');
  assert.equal(verified.body.enrollment.course_id, courseId);

  const completion = await request(`/api/v1/lessons/${lessonId}/complete`, {
    method: 'PATCH',
    token: student.token,
  });
  assert.equal(completion.response.status, 200);
  assert.equal(completion.body.completion_pct, 100);

  const assignment = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('assignment image'),
  ]);
  const uploaded = await upload(student.token, assignment, 'image/png', 'assignment.png');
  assert.equal(uploaded.response.status, 201);
  assert.match(uploaded.body.asset.url, /^\/api\/v1\/integrations\/assets\//);

  const submitted = await request(`/api/v1/lessons/${lessonId}/submit`, {
    method: 'POST',
    token: student.token,
    body: { content: 'Completed work', fileUrl: uploaded.body.asset.url },
  });
  assert.equal(submitted.response.status, 201);
  const submissionId = submitted.body.submission.id;

  const graded = await request(`/api/v1/submissions/${submissionId}/grade`, {
    method: 'PATCH',
    token: instructor.token,
    body: { grade: 95, feedback: 'Excellent work' },
  });
  assert.equal(graded.response.status, 200);
  assert.equal(Number(graded.body.submission.grade), 95);

  const studentView = await request(`/api/v1/submissions/${submissionId}`, { token: student.token });
  assert.equal(studentView.response.status, 200);
  assert.equal(Number(studentView.body.submission.grade), 95);
  assert.equal(studentView.body.submission.feedback, 'Excellent work');

  const studentDashboard = await request('/api/v1/dashboard', { token: student.token });
  assert.equal(studentDashboard.body.dashboard.average_completion_pct, 100);
  assert.equal(studentDashboard.body.dashboard.graded_submissions, 1);
  const instructorDashboard = await request('/api/v1/dashboard', { token: instructor.token });
  assert.equal(instructorDashboard.body.dashboard.courses_created, 1);
  assert.equal(instructorDashboard.body.dashboard.learners, 1);

  const messages = getSentMessages();
  assert.equal(messages.filter((message) => message.subject === 'Welcome to LearnLoop').length, 2);
  assert.equal(messages.filter((message) => message.subject === `Enrollment confirmed: ${course.body.course.title}`).length, 1);
  assert.equal(messages.filter((message) => message.subject === 'Your assignment has been graded').length, 1);
});

test('validates uploaded file MIME types and the 10 MB limit', async () => {
  const instructor = await register('Upload Instructor', 'upload-teacher@example.test', 'instructor');
  const pdf = await upload(instructor.token, Buffer.from('%PDF-1.7 sample'), 'application/pdf', 'sample.pdf');
  assert.equal(pdf.response.status, 201);
  assert.match(pdf.body.asset.filename, /^[0-9a-f-]+\.pdf$/);

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  const base64Png = await request('/api/v1/integrations/uploads', {
    method: 'POST',
    token: instructor.token,
    body: { data: `data:image/png;base64,${png.toString('base64')}` },
  });
  assert.equal(base64Png.response.status, 201);
  uploadedAssets.push(base64Png.body.asset);
  const privateAsset = await fetch(`${baseUrl}${base64Png.body.asset.url}`, {
    headers: { authorization: `Bearer ${instructor.token}` },
  });
  assert.equal(privateAsset.status, 200);

  const publicPng = await request('/api/v1/integrations/uploads?public=true', {
    method: 'POST',
    token: instructor.token,
    body: (() => {
      const form = new FormData();
      form.append('file', new Blob([png], { type: 'image/png' }), 'public.png');
      return form;
    })(),
  });
  assert.equal(publicPng.response.status, 201);
  uploadedAssets.push(publicPng.body.asset);
  assert.match(publicPng.body.asset.url, /^\/uploads\//);
  assert.equal((await fetch(`${baseUrl}${publicPng.body.asset.url}`)).status, 200);

  const invalidMime = await upload(instructor.token, Buffer.from('<svg></svg>'), 'image/svg+xml', 'bad.svg');
  assert.equal(invalidMime.response.status, 415);

  const oversized = await upload(
    instructor.token,
    Buffer.alloc(MAX_FILE_SIZE + 1, 0),
    'application/pdf',
    'oversized.pdf',
  );
  assert.equal(oversized.response.status, 413);
});

test('returns admin-wide dashboard analytics', async () => {
  const admin = await register('Admin User', 'admin@example.test', 'admin');
  const result = await request('/api/v1/dashboard', { token: admin.token });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.dashboard.role, 'admin');
  assert.equal(result.body.dashboard.courses, 1);
  assert.equal(result.body.dashboard.enrollments, 1);
  assert.equal(result.body.dashboard.pending_grading, 0);
});
