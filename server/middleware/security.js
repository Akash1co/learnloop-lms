const PRODUCTION_SECRET_MIN_LENGTH = 32;
const DEFAULT_SECRET_VALUES = new Set([
  'learnloop-development-secret',
  'replace-with-a-long-random-secret',
  'changeme',
  'change-me',
  'secret',
]);
const WEAK_SECRET_PREFIX = /^(change|replace|your|example|sample|development|test|password)[-_ ]/i;

function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.JWT_SECRET;
  if (typeof secret !== 'string'
    || secret.length < PRODUCTION_SECRET_MIN_LENGTH
    || DEFAULT_SECRET_VALUES.has(secret.toLowerCase())
    || WEAK_SECRET_PREFIX.test(secret)
    || /^(.)\1+$/.test(secret)) {
    throw new Error('Production requires a strong JWT_SECRET of at least 32 characters');
  }
}

function createRateLimiter({ windowMs, max, message }) {
  const requestsByIp = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const recentRequests = (requestsByIp.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recentRequests.length >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - recentRequests[0])) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      res.set('RateLimit-Limit', String(max));
      res.set('RateLimit-Remaining', '0');
      res.set('RateLimit-Reset', String(Math.ceil((now + retryAfterSeconds * 1000) / 1000)));
      return res.status(429).json({ error: message });
    }

    recentRequests.push(now);
    requestsByIp.set(key, recentRequests);
    if (requestsByIp.size > 10000) {
      for (const [ip, timestamps] of requestsByIp) {
        if (!timestamps.some((timestamp) => now - timestamp < windowMs)) requestsByIp.delete(ip);
      }
    }
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(max - recentRequests.length));
    return next();
  };
}

function sanitizeValue(value, depth = 0) {
  if (depth > 50) {
    const error = new Error('Request body exceeds the maximum nesting depth');
    error.statusCode = 422;
    throw error;
  }
  if (typeof value === 'string') return value.replace(/\0/g, '');
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const sanitized = {};
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
      sanitized[key] = sanitizeValue(item, depth + 1);
    }
    return sanitized;
  }
  return value;
}

function sanitizeRequest(req, res, next) {
  try {
    if (req.body && typeof req.body === 'object') req.body = sanitizeValue(req.body);
    return next();
  } catch (error) {
    return next(error);
  }
}

function validateString(value, { minLength = 0, maxLength = Infinity, trim = true } = {}) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\0/g, '');
  const normalized = trim ? cleaned.trim() : cleaned;
  return normalized.length >= minLength && normalized.length <= maxLength ? normalized : null;
}

function forceHttps(req, res, next) {
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS === 'true' && !req.secure) {
    return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
  }
  return next();
}

const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'Too many requests; try again later',
});
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many authentication attempts; try again later',
});

module.exports = {
  assertProductionSecrets,
  authRateLimiter,
  createRateLimiter,
  forceHttps,
  globalRateLimiter,
  sanitizeRequest,
  sanitizeValue,
  validateString,
};
