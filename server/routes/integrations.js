const express = require('express');
const multer = require('multer');
const path = require('path');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  completePayment, createPaymentOrder, findEnrollment, getCourse, getPaymentOrder, getUser,
} = require('../store');
const { sendEnrollmentEmail } = require('../services/emailService');
const { createProviderOrder, verifySignature } = require('../services/paymentService');
const {
  ALLOWED_TYPES, MAX_FILE_SIZE, UploadError, readAsset, saveBase64Upload, saveUpload,
} = require('../services/storageService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter(req, file, callback) {
    if (!ALLOWED_TYPES.has(file.mimetype)) return callback(new UploadError('Unsupported file MIME type', 415));
    return callback(null, true);
  },
});

router.post('/payments/checkout', authenticate, authorizeRoles('student'), async (req, res, next) => {
  const courseId = req.body && req.body.courseId;
  if (typeof courseId !== 'string' || !courseId) return res.status(422).json({ error: 'courseId is required' });
  try {
    const course = await getCourse(courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const amount = Number(course.price);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(422).json({ error: 'Course does not require payment' });
    if (await findEnrollment(req.user.sub, courseId)) return res.status(409).json({ error: 'Already enrolled in this course' });
    const providerOrder = await createProviderOrder({
      amount,
      currency: process.env.PAYMENT_CURRENCY || (process.env.PAYMENT_PROVIDER === 'stripe' ? 'USD' : 'INR'),
      courseId,
      userId: req.user.sub,
    });
    const payment = await createPaymentOrder({
      userId: req.user.sub, courseId, amount, currency: providerOrder.currency,
      providerOrderId: providerOrder.providerOrderId, provider: providerOrder.provider,
    });
    return res.status(201).json({ order: payment, checkout: providerOrder.checkout });
  } catch (error) {
    return next(error);
  }
});

router.post('/payments/verify', authenticate, authorizeRoles('student'), async (req, res, next) => {
  const { orderId, paymentId, signature } = req.body || {};
  if (typeof orderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') {
    return res.status(422).json({ error: 'orderId, paymentId, and signature are required' });
  }
  try {
    const order = await getPaymentOrder(orderId, req.user.sub);
    if (!order) return res.status(404).json({ error: 'Payment order not found' });
    if (!verifySignature(orderId, paymentId, signature)) {
      return res.status(400).json({ error: 'Payment signature is invalid' });
    }
    const alreadyPaid = order.status === 'paid';
    const result = await completePayment(orderId, req.user.sub);
    if (!alreadyPaid) {
      const course = await getCourse(order.course_id);
      const user = await getUser(req.user.sub);
      await sendEnrollmentEmail(user, course);
    }
    return res.json({ payment: result.payment, enrollment: result.enrollment });
  } catch (error) {
    return next(error);
  }
});

router.post('/uploads', authenticate, async (req, res, next) => {
  upload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      const status = uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : (uploadError.statusCode || 400);
      return res.status(status).json({ error: status === 413 ? 'File exceeds the 10 MB limit' : uploadError.message });
    }
    const body = req.body || {};
    const isPublic = req.query.public === 'true' || body.public === true || body.public === 'true';
    if (isPublic && !['admin', 'instructor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only instructors and admins may publish assets' });
    }
    try {
      const asset = req.file
        ? await saveUpload({ buffer: req.file.buffer, mimeType: req.file.mimetype, isPublic })
        : await saveBase64Upload({
          data: body.data,
          mimeType: body.mimeType || body.mime_type,
          isPublic,
        });
      return res.status(201).json({ asset });
    } catch (error) {
      if (error instanceof UploadError) return res.status(error.statusCode).json({ error: error.message });
      return next(error);
    }
  });
});

router.get('/assets/:filename', authenticate, async (req, res, next) => {
  try {
    const buffer = await readAsset(req.params.filename);
    const mimeType = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
    }[path.extname(req.params.filename)] || 'application/octet-stream';
    res.type(mimeType);
    return res.send(buffer);
  } catch (error) {
    if (error instanceof UploadError) return res.status(error.statusCode).json({ error: error.message });
    return next(error);
  }
});

module.exports = router;
