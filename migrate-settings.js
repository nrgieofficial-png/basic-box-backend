import Database from 'better-sqlite3';

const db = new Database('./data/database.sqlite');

try {
  db.exec('ALTER TABLE merchants ADD COLUMN is_open BOOLEAN DEFAULT 1;');
  console.log('Migration successful: Added is_open to merchants.');
} catch (e) {
  if (e.message.includes('duplicate column name')) {
    console.log('Column is_open already exists.');
  } else {
    console.error('Migration failed:', e.message);
  }
}
