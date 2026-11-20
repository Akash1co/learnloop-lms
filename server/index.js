const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '14mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads', 'public')));

app.get('/', (req, res) => {
  res.json({ message: 'LearnLoop LMS API is running' });
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