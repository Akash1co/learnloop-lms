const { randomUUID } = require('crypto');
const pool = require('./db');

const isTest = process.env.NODE_ENV === 'test';
const memory = {
  users: [], courses: [], modules: [], lessons: [], enrollments: [],
  progress: [], submissions: [], payments: [],
};

function publicUser(user) {
  if (!user) return null;
  const { password_hash: ignored, ...safeUser } = user;
  return safeUser;
}

function timestamp() {
  return new Date().toISOString();
}

async function query(sql, values = []) {
  const [rows] = await pool.execute(sql, values);
  return rows;
}

function courseWithCurriculum(course) {
  if (!course) return null;
  const modules = memory.modules
    .filter((module) => module.course_id === course.id && !module.deleted_at)
    .sort((a, b) => a.position - b.position)
    .map((module) => ({
      ...module,
      lessons: memory.lessons
        .filter((lesson) => lesson.module_id === module.id && !lesson.deleted_at)
        .sort((a, b) => a.position - b.position),
    }));
  return { ...course, modules };
}

async function findUserByEmail(email) {
  if (isTest) return memory.users.find((user) => user.email === email && !user.deleted_at) || null;
  const rows = await query(
    'SELECT id, name, email, password_hash, role, created_at, updated_at FROM users WHERE email = ? AND deleted_at IS NULL',
    [email],
  );
  return rows[0] || null;
}

async function getUser(id) {
  if (isTest) return memory.users.find((user) => user.id === id && !user.deleted_at) || null;
  const rows = await query(
    'SELECT id, name, email, role FROM users WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  return rows[0] || null;
}

async function createUser({ name, email, passwordHash, role }) {
  const user = {
    id: randomUUID(), name, email, password_hash: passwordHash, role,
    created_at: timestamp(), updated_at: timestamp(), deleted_at: null,
  };
  if (isTest) {
    memory.users.push(user);
    return user;
  }
  await query(
    'INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [user.id, name, email, passwordHash, role],
  );
  return user;
}

async function listCourses() {
  if (isTest) return memory.courses.filter((course) => !course.deleted_at);
  return query(
    'SELECT id, title, description, instructor_id, price, created_at, updated_at FROM courses WHERE deleted_at IS NULL ORDER BY created_at DESC',
  );
}

async function createCourse({ title, description, instructorId, price = 0 }) {
  const course = {
    id: randomUUID(), title, description: description || null, instructor_id: instructorId,
    price: Number(price), created_at: timestamp(), updated_at: timestamp(), deleted_at: null,
  };
  if (isTest) {
    memory.courses.push(course);
    return course;
  }
  await query(
    'INSERT INTO courses (id, title, description, instructor_id, price) VALUES (?, ?, ?, ?, ?)',
    [course.id, course.title, course.description, course.instructor_id, course.price],
  );
  return course;
}

async function getCourse(id) {
  if (isTest) {
    const course = memory.courses.find((item) => item.id === id && !item.deleted_at);
    return courseWithCurriculum(course);
  }
  const courses = await query(
    'SELECT id, title, description, instructor_id, price, created_at, updated_at FROM courses WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  if (!courses[0]) return null;
  const modules = await query(
    'SELECT id, course_id, title, position, created_at, updated_at FROM course_modules WHERE course_id = ? AND deleted_at IS NULL ORDER BY position, created_at',
    [id],
  );
  const lessons = modules.length
    ? await query(
      `SELECT id, module_id, title, content, position, created_at, updated_at
       FROM lessons WHERE module_id IN (${modules.map(() => '?').join(',')})
       AND deleted_at IS NULL ORDER BY position, created_at`,
      modules.map((module) => module.id),
    )
    : [];
  return {
    ...courses[0],
    modules: modules.map((module) => ({
      ...module,
      lessons: lessons.filter((lesson) => lesson.module_id === module.id),
    })),
  };
}

async function addModule(courseId, { title, position = 0 }) {
  const course = await getCourse(courseId);
  if (!course) return null;
  const module = {
    id: randomUUID(), course_id: courseId, title, position: Number(position),
    created_at: timestamp(), updated_at: timestamp(), deleted_at: null,
  };
  if (isTest) memory.modules.push(module);
  else await query(
    'INSERT INTO course_modules (id, course_id, title, position) VALUES (?, ?, ?, ?)',
    [module.id, module.course_id, module.title, module.position],
  );
  return module;
}

async function addLesson(moduleId, { title, content, position = 0 }) {
  let module;
  if (isTest) module = memory.modules.find((item) => item.id === moduleId && !item.deleted_at);
  else {
    const rows = await query(
      'SELECT id FROM course_modules WHERE id = ? AND deleted_at IS NULL',
      [moduleId],
    );
    module = rows[0];
  }
  if (!module) return null;
  const lesson = {
    id: randomUUID(), module_id: moduleId, title, content: content || null,
    position: Number(position), created_at: timestamp(), updated_at: timestamp(), deleted_at: null,
  };
  if (isTest) memory.lessons.push(lesson);
  else await query(
    'INSERT INTO lessons (id, module_id, title, content, position) VALUES (?, ?, ?, ?, ?)',
    [lesson.id, lesson.module_id, lesson.title, lesson.content, lesson.position],
  );
  return lesson;
}

async function getModule(moduleId) {
  if (isTest) {
    const module = memory.modules.find((item) => item.id === moduleId && !item.deleted_at);
    if (!module) return null;
    const course = memory.courses.find((item) => item.id === module.course_id && !item.deleted_at);
    return course ? { ...module, instructor_id: course.instructor_id } : null;
  }
  const rows = await query(
    `SELECT cm.id, cm.course_id, cm.title, cm.position, c.instructor_id
     FROM course_modules cm JOIN courses c ON c.id = cm.course_id
     WHERE cm.id = ? AND cm.deleted_at IS NULL AND c.deleted_at IS NULL`,
    [moduleId],
  );
  return rows[0] || null;
}

async function findLesson(id) {
  if (isTest) {
    const lesson = memory.lessons.find((item) => item.id === id && !item.deleted_at);
    if (!lesson) return null;
    const module = memory.modules.find((item) => item.id === lesson.module_id && !item.deleted_at);
    const course = module && memory.courses.find((item) => item.id === module.course_id && !item.deleted_at);
    return course ? { ...lesson, course_id: course.id, instructor_id: course.instructor_id } : null;
  }
  const rows = await query(
    `SELECT l.id, l.module_id, l.title, l.content, cm.course_id, c.instructor_id
     FROM lessons l JOIN course_modules cm ON cm.id = l.module_id
     JOIN courses c ON c.id = cm.course_id
     WHERE l.id = ? AND l.deleted_at IS NULL AND cm.deleted_at IS NULL AND c.deleted_at IS NULL`,
    [id],
  );
  return rows[0] || null;
}

async function findEnrollment(userId, courseId) {
  if (isTest) return memory.enrollments.find(
    (item) => item.user_id === userId && item.course_id === courseId && !item.deleted_at,
  ) || null;
  const rows = await query(
    'SELECT * FROM enrollments WHERE user_id = ? AND course_id = ? AND deleted_at IS NULL',
    [userId, courseId],
  );
  return rows[0] || null;
}

async function createEnrollment(userId, courseId) {
  const existing = await findEnrollment(userId, courseId);
  if (existing) return { enrollment: existing, created: false };
  const enrollment = {
    id: randomUUID(), user_id: userId, course_id: courseId, completion_pct: 0,
    enrolled_at: timestamp(), created_at: timestamp(), updated_at: timestamp(), deleted_at: null,
  };
  if (isTest) memory.enrollments.push(enrollment);
  else await query(
    'INSERT INTO enrollments (id, user_id, course_id, completion_pct) VALUES (?, ?, ?, 0)',
    [enrollment.id, userId, courseId],
  );
  return { enrollment, created: true };
}

async function completeLesson(userId, lessonId) {
  const lesson = await findLesson(lessonId);
  if (!lesson || !(await findEnrollment(userId, lesson.course_id))) return null;
  const now = timestamp();
  if (isTest) {
    const existing = memory.progress.find((item) => item.user_id === userId && item.lesson_id === lessonId);
    if (existing) existing.completed_at = now;
    else memory.progress.push({ id: randomUUID(), user_id: userId, lesson_id: lessonId, completed_at: now });
    const courseLessons = memory.lessons.filter((item) => {
      const module = memory.modules.find((entry) => entry.id === item.module_id);
      return module && module.course_id === lesson.course_id && !item.deleted_at;
    });
    const completed = memory.progress.filter((item) => courseLessons.some((entry) => entry.id === item.lesson_id)
      && item.user_id === userId && item.completed_at).length;
    const enrollment = memory.enrollments.find((item) => item.user_id === userId
      && item.course_id === lesson.course_id && !item.deleted_at);
    enrollment.completion_pct = courseLessons.length ? Math.round((completed / courseLessons.length) * 100) : 0;
    enrollment.updated_at = now;
    return { completion_pct: enrollment.completion_pct };
  }
  await query(
    `INSERT INTO lesson_progress (id, user_id, lesson_id, completed_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
    [randomUUID(), userId, lessonId],
  );
  const counts = await query(
    `SELECT COUNT(DISTINCT l.id) AS total,
       COUNT(DISTINCT CASE WHEN lp.completed_at IS NOT NULL THEN l.id END) AS completed
     FROM lessons l JOIN course_modules cm ON cm.id = l.module_id
     LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ? AND lp.deleted_at IS NULL
     WHERE cm.course_id = ? AND l.deleted_at IS NULL AND cm.deleted_at IS NULL`,
    [userId, lesson.course_id],
  );
  const total = Number(counts[0].total);
  const completionPct = total ? Math.round((Number(counts[0].completed) / total) * 100) : 0;
  await query(
    'UPDATE enrollments SET completion_pct = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND course_id = ? AND deleted_at IS NULL',
    [completionPct, userId, lesson.course_id],
  );
  return { completion_pct: completionPct };
}

async function createSubmission({ userId, lessonId, content, fileUrl }) {
  const lesson = await findLesson(lessonId);
  if (!lesson || !(await findEnrollment(userId, lesson.course_id))) return null;
  const submission = {
    id: randomUUID(), user_id: userId, lesson_id: lessonId, content: content || '',
    file_url: fileUrl || null, grade: null, feedback: null, submitted_at: timestamp(),
    created_at: timestamp(), updated_at: timestamp(), deleted_at: null,
  };
  if (isTest) memory.submissions.push(submission);
  else await query(
    'INSERT INTO submissions (id, user_id, lesson_id, content, file_url) VALUES (?, ?, ?, ?, ?)',
    [submission.id, userId, lessonId, submission.content, submission.file_url],
  );
  return submission;
}

async function getSubmission(id) {
  if (isTest) {
    const submission = memory.submissions.find((item) => item.id === id && !item.deleted_at);
    if (!submission) return null;
    const lesson = await findLesson(submission.lesson_id);
    const user = await getUser(submission.user_id);
    return { ...submission, course_id: lesson && lesson.course_id, instructor_id: lesson && lesson.instructor_id,
      student_email: user && user.email, student_name: user && user.name };
  }
  const rows = await query(
    `SELECT s.*, c.id AS course_id, c.instructor_id, u.email AS student_email, u.name AS student_name
     FROM submissions s JOIN lessons l ON l.id = s.lesson_id
     JOIN course_modules cm ON cm.id = l.module_id
     JOIN courses c ON c.id = cm.course_id JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.deleted_at IS NULL`,
    [id],
  );
  return rows[0] || null;
}

async function gradeSubmission(id, grade, feedback) {
  const submission = await getSubmission(id);
  if (!submission) return null;
  if (isTest) {
    const stored = memory.submissions.find((item) => item.id === id);
    stored.grade = Number(grade);
    stored.feedback = feedback || null;
    stored.updated_at = timestamp();
    return getSubmission(id);
  }
  await query(
    'UPDATE submissions SET grade = ?, feedback = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
    [grade, feedback || null, id],
  );
  return getSubmission(id);
}

async function createPaymentOrder({ userId, courseId, amount, currency, providerOrderId, provider }) {
  const payment = {
    id: randomUUID(), user_id: userId, course_id: courseId, amount: Number(amount), currency,
    provider_order_id: providerOrderId, provider, status: 'pending', created_at: timestamp(), paid_at: null,
  };
  if (isTest) memory.payments.push(payment);
  else await query(
    `INSERT INTO payment_orders (id, user_id, course_id, amount, currency, provider_order_id, provider, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [payment.id, userId, courseId, payment.amount, currency, providerOrderId, provider],
  );
  return payment;
}

async function getPaymentOrder(providerOrderId, userId) {
  if (isTest) return memory.payments.find(
    (item) => item.provider_order_id === providerOrderId && item.user_id === userId,
  ) || null;
  const rows = await query(
    'SELECT * FROM payment_orders WHERE provider_order_id = ? AND user_id = ?',
    [providerOrderId, userId],
  );
  return rows[0] || null;
}

async function completePayment(providerOrderId, userId) {
  if (isTest) {
    const payment = await getPaymentOrder(providerOrderId, userId);
    if (!payment) return null;
    if (payment.status !== 'paid') {
      payment.status = 'paid';
      payment.paid_at = timestamp();
    }
    const { enrollment } = await createEnrollment(userId, payment.course_id);
    return { payment: { ...payment }, enrollment };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [payments] = await connection.execute(
      'SELECT * FROM payment_orders WHERE provider_order_id = ? AND user_id = ? FOR UPDATE',
      [providerOrderId, userId],
    );
    const payment = payments[0];
    if (!payment) {
      await connection.commit();
      return null;
    }
    if (payment.status !== 'paid') {
      await connection.execute(
        'UPDATE payment_orders SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['paid', payment.id],
      );
      payment.status = 'paid';
      payment.paid_at = timestamp();
    }
    const [enrollments] = await connection.execute(
      'SELECT * FROM enrollments WHERE user_id = ? AND course_id = ? AND deleted_at IS NULL FOR UPDATE',
      [userId, payment.course_id],
    );
    let enrollment = enrollments[0];
    if (!enrollment) {
      const id = randomUUID();
      await connection.execute(
        'INSERT INTO enrollments (id, user_id, course_id, completion_pct) VALUES (?, ?, ?, 0)',
        [id, userId, payment.course_id],
      );
      const [created] = await connection.execute('SELECT * FROM enrollments WHERE id = ?', [id]);
      enrollment = created[0];
    }
    await connection.commit();
    return { payment, enrollment };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function dashboard(user) {
  if (isTest) {
    if (user.role === 'student') {
      const enrollments = memory.enrollments.filter((item) => item.user_id === user.sub && !item.deleted_at);
      const submissions = memory.submissions.filter((item) => item.user_id === user.sub && !item.deleted_at);
      return {
        role: 'student', enrolled_courses: enrollments.length,
        average_completion_pct: enrollments.length
          ? Math.round(enrollments.reduce((total, item) => total + item.completion_pct, 0) / enrollments.length) : 0,
        pending_grades: submissions.filter((item) => item.grade === null).length,
        graded_submissions: submissions.filter((item) => item.grade !== null).length,
        courses: enrollments.map((item) => {
          const course = memory.courses.find((entry) => entry.id === item.course_id);
          return { id: item.course_id, title: course && course.title, completion_pct: item.completion_pct };
        }),
      };
    }
    if (user.role === 'admin') {
      return {
        role: 'admin',
        users: memory.users.filter((item) => !item.deleted_at).length,
        courses: memory.courses.filter((item) => !item.deleted_at).length,
        enrollments: memory.enrollments.filter((item) => !item.deleted_at).length,
        pending_grading: memory.submissions.filter((item) => item.grade === null && !item.deleted_at).length,
      };
    }
    const courses = memory.courses.filter((item) => item.instructor_id === user.sub && !item.deleted_at);
    const courseIds = new Set(courses.map((item) => item.id));
    const lessonIds = new Set(memory.lessons.filter((lesson) => {
      const module = memory.modules.find((item) => item.id === lesson.module_id);
      return module && courseIds.has(module.course_id);
    }).map((lesson) => lesson.id));
    const submissions = memory.submissions.filter((item) => lessonIds.has(item.lesson_id) && !item.deleted_at);
    return {
      role: user.role, courses_created: courses.length,
      learners: memory.enrollments.filter((item) => courseIds.has(item.course_id) && !item.deleted_at).length,
      pending_grading: submissions.filter((item) => item.grade === null).length,
    };
  }

  if (user.role === 'student') {
    const rows = await query(
      `SELECT c.id, c.title, e.completion_pct FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = ? AND e.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY e.enrolled_at DESC`,
      [user.sub],
    );
    const stats = await query(
      `SELECT SUM(CASE WHEN grade IS NULL THEN 1 ELSE 0 END) AS pending_grades,
       SUM(CASE WHEN grade IS NOT NULL THEN 1 ELSE 0 END) AS graded_submissions
       FROM submissions WHERE user_id = ? AND deleted_at IS NULL`,
      [user.sub],
    );
    const average = rows.length
      ? Math.round(rows.reduce((sum, item) => sum + Number(item.completion_pct), 0) / rows.length) : 0;
    return {
      role: 'student', enrolled_courses: rows.length, average_completion_pct: average,
      pending_grades: Number(stats[0].pending_grades || 0),
      graded_submissions: Number(stats[0].graded_submissions || 0), courses: rows,
    };
  }
  if (user.role === 'admin') {
    const stats = await query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users,
         (SELECT COUNT(*) FROM courses WHERE deleted_at IS NULL) AS courses,
         (SELECT COUNT(*) FROM enrollments WHERE deleted_at IS NULL) AS enrollments,
         (SELECT COUNT(*) FROM submissions WHERE grade IS NULL AND deleted_at IS NULL) AS pending_grading`,
    );
    return {
      role: 'admin', users: Number(stats[0].users), courses: Number(stats[0].courses),
      enrollments: Number(stats[0].enrollments), pending_grading: Number(stats[0].pending_grading),
    };
  }
  const stats = await query(
    `SELECT COUNT(DISTINCT c.id) AS courses_created, COUNT(DISTINCT e.id) AS learners,
       COUNT(DISTINCT CASE WHEN s.grade IS NULL THEN s.id END) AS pending_grading
     FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id AND e.deleted_at IS NULL
     LEFT JOIN course_modules cm ON cm.course_id = c.id AND cm.deleted_at IS NULL
     LEFT JOIN lessons l ON l.module_id = cm.id AND l.deleted_at IS NULL
     LEFT JOIN submissions s ON s.lesson_id = l.id AND s.deleted_at IS NULL
     WHERE c.instructor_id = ? AND c.deleted_at IS NULL`,
    [user.sub],
  );
  return {
    role: user.role, courses_created: Number(stats[0].courses_created),
    learners: Number(stats[0].learners), pending_grading: Number(stats[0].pending_grading),
  };
}

function resetMemory() {
  for (const records of Object.values(memory)) records.length = 0;
}

module.exports = {
  addLesson, addModule, completeLesson, completePayment, createCourse, createEnrollment, createPaymentOrder,
  createSubmission, createUser, dashboard, findEnrollment, findLesson, findUserByEmail, getCourse, getModule,
  getPaymentOrder, getSubmission, getUser, gradeSubmission, listCourses, publicUser, resetMemory,
};
