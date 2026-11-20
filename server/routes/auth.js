const express = require('express');
const bcrypt = require('bcryptjs');
const {
  createUser, findUserByEmail, publicUser,
} = require('../store');
const { sendWelcomeEmail } = require('../services/emailService');
const {
  authenticate, issueToken, revokeToken,
} = require('../middleware/auth');

const router = express.Router();

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validRegistration(body) {
  return body && typeof body.name === 'string' && body.name.trim().length >= 2
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(body.email))
    && typeof body.password === 'string' && body.password.length >= 8;
}

router.post('/register', async (req, res, next) => {
  if (!validRegistration(req.body)) {
    return res.status(422).json({ error: 'Name, valid email, and password of at least 8 characters are required' });
  }
  try {
    const email = normalizeEmail(req.body.email);
    if (await findUserByEmail(email)) return res.status(409).json({ error: 'Email is already registered' });
    const role = ['student', 'instructor', 'admin'].includes(req.body.role) ? req.body.role : 'student';
    const user = await createUser({
      name: req.body.name.trim(), email, role,
      passwordHash: await bcrypt.hash(req.body.password, 12),
    });
    await sendWelcomeEmail(user);
    return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  const email = normalizeEmail(req.body && req.body.email);
  const password = req.body && req.body.password;
  if (!email || typeof password !== 'string') return res.status(401).json({ error: 'Invalid credentials' });
  try {
    const user = await findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    return res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', authenticate, (req, res) => {
  revokeToken(req.authToken);
  return res.json({ message: 'Logged out successfully' });
});

module.exports = router;
