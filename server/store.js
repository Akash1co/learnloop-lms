const { randomUUID } = require('crypto');
const pool = require('./db');

const isTest = process.env.NODE_ENV === 'test';
const memory = { users: [], courses: [] };

function publicUser(user) {
  if (!user) return null;
  const { password_hash: ignored, ...safeUser } = user;
  return safeUser;
}

async function findUserByEmail(email) {
  if (isTest) return memory.users.find((user) => user.email === email && !user.deleted_at) || null;
  const result = await pool.query(
    'SELECT id, name, email, password_hash, role, created_at, updated_at FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email],
  );
  return result.rows[0] || null;
}

async function createUser({ name, email, passwordHash, role }) {
  if (isTest) {
    const user = {
      id: randomUUID(), name, email, password_hash: passwordHash, role,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
    };
    memory.users.push(user);
    return user;
  }
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, password_hash, role, created_at, updated_at`,
    [name, email, passwordHash, role],
  );
  return result.rows[0];
}

async function listCourses() {
  if (isTest) return memory.courses.filter((course) => !course.deleted_at);
  const result = await pool.query(
    'SELECT id, title, description, instructor_id, created_at, updated_at FROM courses WHERE deleted_at IS NULL ORDER BY created_at DESC',
  );
  return result.rows;
}

async function createCourse({ title, description, instructorId }) {
  if (isTest) {
    const course = {
      id: randomUUID(), title, description: description || null, instructor_id: instructorId,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
    };
    memory.courses.push(course);
    return course;
  }
  const result = await pool.query(
    `INSERT INTO courses (title, description, instructor_id)
     VALUES ($1, $2, $3)
     RETURNING id, title, description, instructor_id, created_at, updated_at`,
    [title, description || null, instructorId],
  );
  return result.rows[0];
}

function resetMemory() {
  memory.users.length = 0;
  memory.courses.length = 0;
}

module.exports = { createUser, findUserByEmail, listCourses, createCourse, publicUser, resetMemory };
