// ============================================================
// BASIC BOX — DATABASE SEED SCRIPT
// Creates ONLY the admin user. No mock merchants or products.
// Real merchants register via the app, admin approves them.
// Run: npm run seed
// ============================================================

import { DB } from './database.js';

async function seed() {
  console.log('🌱 Starting database seed...');
  console.log('⚠️  Clearing all existing data from Firestore...');

  // Clear all collections
  const collections = ['otps', 'order_items', 'orders', 'products', 'merchants', 'users'];
  for (const col of collections) {
    await DB.clearTable(col);
    console.log(`   ✓ Cleared collection: ${col}`);
  }

  console.log('\n👤 Creating admin user...');
  const admin = await DB.insert('users', {
    name: 'Admin Manager',
    email: 'drsuboxy@aot.we',
    password: 'Blackclover@yami',
    role: 'admin',
    phone: '9876543210'
  });
  console.log(`   ✓ Admin created: ${admin.email} (id: ${admin.id})`);

  console.log('\n✅ Seed complete!');
  console.log('   ─────────────────────────────────────');
  console.log('   Admin Login:');
  console.log('   Email   : drsuboxy@aot.we');
  console.log('   Password: Blackclover@yami');
  console.log('   ─────────────────────────────────────');
  console.log('   Merchants register via the app.');
  console.log('   Admin approves them from the admin panel.');
  console.log('   Customers sign up via OTP on the app.');
  console.log('');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
