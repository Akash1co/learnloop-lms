const express = require('express');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { addLesson, getModule } = require('../store');

const router = express.Router();

router.post('/:id/lessons', authenticate, authorizeRoles('admin', 'instructor'), async (req, res, next) => {
  if (!req.body || typeof req.body.title !== 'string' || req.body.title.trim().length < 1) {
    return res.status(422).json({ error: 'A lesson title is required' });
  }
  const position = req.body.position === undefined ? 0 : Number(req.body.position);
  if (!Number.isInteger(position) || position < 0) return res.status(422).json({ error: 'Lesson position must be a non-negative integer' });
  try {
    const module = await getModule(req.params.id);
    if (!module) return res.status(404).json({ error: 'Module not found' });
    if (req.user.role !== 'admin' && module.instructor_id !== req.user.sub) {
      return res.status(403).json({ error: 'Only the course instructor may manage its curriculum' });
    }
    const lesson = await addLesson(req.params.id, {
      title: req.body.title.trim(), content: req.body.content, position,
    });
    return res.status(201).json({ lesson });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
