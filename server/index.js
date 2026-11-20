const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();
const {
  authRateLimiter,
  assertProductionSecrets,
  globalRateLimiter,
  forceHttps,
  sanitizeRequest,
} = require('./middleware/security');

const app = express();

assertProductionSecrets();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
      'img-src': ["'self'", 'data:', 'https://unpkg.com'],
      'upgrade-insecure-requests': null,
    },
  },
}));
const configuredOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : ['*'];
app.use(cors({ origin: configuredOrigins.length === 1 ? configuredOrigins[0] : configuredOrigins }));
app.use(forceHttps);
app.use('/api/v1', globalRateLimiter);
app.use('/api/v1/auth', authRateLimiter);
app.use(express.json({ limit: '14mb' }));
app.use(sanitizeRequest);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads', 'public')));

app.get('/', (req, res) => {
  res.json({ message: 'LearnLoop LMS API is running' });
});

function healthResponse(req, res) {
  return res.json({
    status: 'ok',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    service: 'LearnLoop LMS API',
  });
}

app.get('/health', healthResponse);
app.get('/api/v1/health', healthResponse);

app.get('/api/docs/openapi.json', (req, res) => {
  return res.sendFile(path.join(__dirname, '..', 'docs', 'openapi.json'));
});
app.get('/api/docs', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LearnLoop LMS API documentation</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: '/api/docs/openapi.json',
        dom_id: '#swagger-ui',
        persistAuthorization: true
      });
    </script>
  </body>
</html>`);
});

app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/courses', require('./routes/courses'));
app.use('/api/v1/modules', require('./routes/modules'));
app.use('/api/v1', require('./routes/enrollments'));
app.use('/api/v1', require('./routes/submissions'));
app.use('/api/v1/integrations', require('./routes/integrations'));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  if (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A record with these values already exists' });
  return res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;