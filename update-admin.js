import Database from 'better-sqlite3';

const db = new Database('./data/database.sqlite');

try {
  // Insert admin user
  const stmt = db.prepare("INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)");
  stmt.run('Admin Manager', 'drsuboxy@aot.we', 'Blackclover@yami', 'admin', '9876543210');
  console.log('Admin user created successfully with email: drsuboxy@aot.we');
} catch (e) {
  console.error('Failed:', e.message);
}
