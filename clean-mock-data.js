import Database from 'better-sqlite3';

const db = new Database('./data/database.sqlite');

try {
  // Disable foreign keys temporarily
  db.pragma('foreign_keys = OFF');

  // Wipe tables completely
  db.exec('DELETE FROM order_items;');
  db.exec('DELETE FROM orders;');
  db.exec('DELETE FROM products;');
  db.exec('DELETE FROM merchants;');
  db.exec('DELETE FROM users WHERE id > 1;');

  // Reset sqlite_sequence for autoincrement IDs
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('merchants', 'products', 'orders', 'order_items', 'users')");
  
  db.pragma('foreign_keys = ON');
  
  console.log('Successfully wiped mock data. System is ready for real data.');
} catch (e) {
  console.error('Failed to wipe data:', e.message);
}
