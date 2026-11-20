const express = require('express');
const bcrypt = require('bcryptjs');
const {
  createUser, findUserByEmail, publicUser,
} = require('../store');
const { sendWelcomeEmail } = require('../services/emailService');
const {
  authenticate, issueToken, revokeToken,
} = require('../middleware/auth');
const { validateString } = require('../middleware/security');

const router = express.Router();

function normalizeEmail(value) {
  return (validateString(value, { minLength: 3, maxLength: 254 }) || '').toLowerCase();
}

function validRegistration(body) {
  return body && validateString(body.name, { minLength: 2, maxLength: 200 })
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(body.email))
    && validateString(body.password, { minLength: 8, maxLength: 1024, trim: false });
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
      name: validateString(req.body.name, { minLength: 2, maxLength: 200 }),
      email, role,
      passwordHash: await bcrypt.hash(
        validateString(req.body.password, { minLength: 8, maxLength: 1024, trim: false }),
        12,
      ),
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
