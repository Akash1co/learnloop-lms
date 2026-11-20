const express = require('express');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  completeLesson, createEnrollment, dashboard, findEnrollment, findLesson, getCourse,
} = require('../store');
const { sendEnrollmentEmail } = require('../services/emailService');
const { getUser } = require('../store');

const router = express.Router();

router.post('/courses/:id/enroll', authenticate, authorizeRoles('student'), async (req, res, next) => {
  try {
    const course = await getCourse(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (Number(course.price) > 0) return res.status(402).json({ error: 'Payment is required before enrollment' });
    const result = await createEnrollment(req.user.sub, course.id);
    if (result.created) {
      const user = await getUser(req.user.sub);
      await sendEnrollmentEmail(user, course);
    }
    return res.status(result.created ? 201 : 200).json({ enrollment: result.enrollment });
  } catch (error) {
    return next(error);
  }
});

router.patch('/lessons/:id/complete', authenticate, authorizeRoles('student'), async (req, res, next) => {
  try {
    const lesson = await findLesson(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (!(await findEnrollment(req.user.sub, lesson.course_id))) {
      return res.status(403).json({ error: 'Enroll in the course before completing lessons' });
    }
    const progress = await completeLesson(req.user.sub, req.params.id);
    if (!progress) return res.status(404).json({ error: 'Lesson not found' });
    return res.json({ lesson_id: req.params.id, ...progress });
  } catch (error) {
    return next(error);
  }
});

router.get('/dashboard', authenticate, async (req, res, next) => {
  try {
    return res.json({ dashboard: await dashboard(req.user) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
