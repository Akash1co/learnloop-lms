const express = require('express');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { addModule, createCourse, getCourse, listCourses } = require('../store');

const router = express.Router();

router.get('/', authenticate, authorizeRoles('admin', 'instructor', 'student'), async (req, res, next) => {
  try {
    return res.json({ courses: await listCourses() });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', authenticate, authorizeRoles('admin', 'instructor', 'student'), async (req, res, next) => {
  try {
    const course = await getCourse(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    return res.json({ course });
  } catch (error) {
    return next(error);
  }
});

router.post('/', authenticate, authorizeRoles('admin', 'instructor'), async (req, res, next) => {
  if (!req.body || typeof req.body.title !== 'string' || req.body.title.trim().length < 2) {
    return res.status(422).json({ error: 'A course title is required' });
  }
  const price = req.body.price === undefined ? 0 : Number(req.body.price);
  if (!Number.isFinite(price) || price < 0) return res.status(422).json({ error: 'Course price must be a non-negative number' });
  try {
    const course = await createCourse({
      title: req.body.title.trim(), description: req.body.description, instructorId: req.user.sub, price,
    });
    return res.status(201).json({ course });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/modules', authenticate, authorizeRoles('admin', 'instructor'), async (req, res, next) => {
  if (!req.body || typeof req.body.title !== 'string' || req.body.title.trim().length < 1) {
    return res.status(422).json({ error: 'A module title is required' });
  }
  const position = req.body.position === undefined ? 0 : Number(req.body.position);
  if (!Number.isInteger(position) || position < 0) return res.status(422).json({ error: 'Module position must be a non-negative integer' });
  try {
    const course = await getCourse(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (req.user.role !== 'admin' && course.instructor_id !== req.user.sub) {
      return res.status(403).json({ error: 'Only the course instructor may manage its curriculum' });
    }
    const module = await addModule(req.params.id, { title: req.body.title.trim(), position });
    return res.status(201).json({ module });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
