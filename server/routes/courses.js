const express = require('express');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { listCourses, createCourse } = require('../store');

const router = express.Router();

router.get('/', authenticate, authorizeRoles('admin', 'instructor', 'student'), async (req, res, next) => {
  try {
    return res.json({ courses: await listCourses() });
  } catch (error) {
    return next(error);
  }
});

router.post('/', authenticate, authorizeRoles('admin', 'instructor'), async (req, res, next) => {
  if (!req.body || typeof req.body.title !== 'string' || req.body.title.trim().length < 2) {
    return res.status(422).json({ error: 'A course title is required' });
  }
  try {
    const course = await createCourse({
      title: req.body.title.trim(), description: req.body.description, instructorId: req.user.sub,
    });
    return res.status(201).json({ course });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
