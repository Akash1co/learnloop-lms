const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'LearnLoop LMS API is running' });
});

app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/courses', require('./routes/courses'));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;