const jwt = require('jsonwebtoken');

const revokedTokens = new Set();
const secret = process.env.JWT_SECRET || 'learnloop-development-secret';

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });
}

function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token || revokedTokens.has(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(token, secret);
    req.authToken = token;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

function revokeToken(token) {
  revokedTokens.add(token);
}

function resetRevokedTokens() {
  revokedTokens.clear();
}

module.exports = { authenticate, authorizeRoles, issueToken, revokeToken, resetRevokedTokens };
