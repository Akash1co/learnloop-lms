const express = require('express');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { createSubmission, getSubmission, gradeSubmission } = require('../store');
const { sendGradeEmail } = require('../services/emailService');

const router = express.Router();

router.post('/lessons/:id/submit', authenticate, authorizeRoles('student'), async (req, res, next) => {
  const content = req.body && typeof req.body.content === 'string' ? req.body.content.trim() : '';
  const fileUrl = req.body && (req.body.fileUrl || req.body.file_url);
  if (!content && (typeof fileUrl !== 'string' || !fileUrl.trim())) {
    return res.status(422).json({ error: 'Submission content or an uploaded file URL is required' });
  }
  try {
    const submission = await createSubmission({
      userId: req.user.sub,
      lessonId: req.params.id,
      content,
      fileUrl: typeof fileUrl === 'string' ? fileUrl.trim() : null,
    });
    if (!submission) return res.status(403).json({ error: 'Enroll in the course before submitting work' });
    return res.status(201).json({ submission });
  } catch (error) {
    return next(error);
  }
});

router.get('/submissions/:id', authenticate, async (req, res, next) => {
  try {
    const submission = await getSubmission(req.params.id);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    const isOwner = submission.user_id === req.user.sub;
    const isInstructor = submission.instructor_id === req.user.sub;
    if (!isOwner && !isInstructor && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You may not view this submission' });
    }
    return res.json({ submission });
  } catch (error) {
    return next(error);
  }
});

router.patch('/submissions/:id/grade', authenticate, authorizeRoles('admin', 'instructor'), async (req, res, next) => {
  const grade = Number(req.body && req.body.grade);
  if (!Number.isFinite(grade) || grade < 0 || grade > 100) {
    return res.status(422).json({ error: 'Grade must be a number from 0 to 100' });
  }
  if (req.body.feedback !== undefined && typeof req.body.feedback !== 'string') {
    return res.status(422).json({ error: 'Feedback must be text' });
  }
  try {
    const existing = await getSubmission(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Submission not found' });
    if (req.user.role !== 'admin' && existing.instructor_id !== req.user.sub) {
      return res.status(403).json({ error: 'Only the course instructor may grade this submission' });
    }
    const submission = await gradeSubmission(req.params.id, grade, req.body.feedback);
    await sendGradeEmail(submission);
    return res.json({ submission });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
