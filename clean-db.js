import Database from 'better-sqlite3';

const db = new Database('./data/database.sqlite');
db.prepare("DELETE FROM products WHERE name LIKE '%Bot%'").run();
db.prepare("DELETE FROM merchants WHERE store_name LIKE '%Bot%'").run();
console.log('Dummy data deleted successfully.');
