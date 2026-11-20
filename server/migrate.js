const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_init_schema.sql'), 'utf8');
  for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
  await pool.end();
  console.log('Database migration completed');
}

if (require.main === module) {
  migrate().catch((error) => {
    console.error('Database migration failed', error);
    process.exitCode = 1;
  });
}

module.exports = migrate;
