import express from 'express';
import cors from 'cors';
import { DB } from './database.js';
import { sendOTP } from './mailer.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
// Use memory storage — files stored in MongoDB, not on disk (Render wipes disk on restart)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Image Upload Endpoint — stores in MongoDB so images survive Render restarts
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const record = await DB.insert('files', {
      data: `data:${mimeType};base64,${base64}`,
      filename: req.file.originalname,
      mimetype: mimeType,
      size: req.file.size
    });
    const url = `/api/files/${record.id}`;
    res.json({ url });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Serve uploaded images from MongoDB
app.get('/api/files/:id', async (req, res) => {
  try {
    const file = await DB.getById('files', req.params.id);
    if (!file || !file.data) {
      return res.status(404).json({ error: 'File not found' });
    }
    const matches = file.data.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      return res.status(500).json({ error: 'Invalid file data' });
    }
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  } catch (err) {
    console.error('File serve error:', err);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Also serve any old local uploads for backwards compatibility
app.use('/uploads', express.static('uploads'));

// ─────────────────────────────────────────────
// AUTHENTICATION
// ─────────────────────────────────────────────

// 1. Customer: Request OTP
app.post('/api/auth/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const existing = await DB.findOne('users', [{ field: 'email', op: '==', value: email.toLowerCase() }]);

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expires_at = new Date(Date.now() + 10 * 60000).toISOString();

    await DB.insert('otps', { email: email.toLowerCase(), otp, expires_at });

    // Fire-and-forget: respond instantly, email sends in background
    sendOTP(email, otp).catch(err => console.error('[OTP SEND BG]', err.message));

    res.json({ existing: !!existing });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Customer: Verify OTP & Login/Register
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp, registerData } = req.body;
    const normalizedEmail = email.toLowerCase();

    const otpRecord = await DB.findOne('otps', [
      { field: 'email', op: '==', value: normalizedEmail },
      { field: 'otp', op: '==', value: otp }
    ]);

    if (!otpRecord) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }
    if (new Date(otpRecord.expires_at) < new Date()) return res.status(401).json({ error: 'OTP Expired' });

    let user = await DB.findOne('users', [{ field: 'email', op: '==', value: normalizedEmail }]);

    if (!user) {
      if (!registerData || !registerData.name) {
        return res.status(400).json({ error: 'Registration data required for new users' });
      }
      user = await DB.insert('users', {
        name: registerData.name,
        email: normalizedEmail,
        phone: registerData.phone || '',
        default_address: registerData.default_address || '',
        default_landmark: registerData.default_landmark || '',
        role: 'user'
      });
    }

    await DB.delete('otps', otpRecord.id);

    const { password, ...safeUser } = user;
    res.json({ user: safeUser, merchant: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Merchant: Register
app.post('/api/auth/merchant/register', async (req, res) => {
  try {
    const { store_name, address, phone, email, password } = req.body;
    const normalizedEmail = email.toLowerCase();

    if (await DB.findOne('users', [{ field: 'email', op: '==', value: normalizedEmail }])) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const user = await DB.insert('users', {
      name: store_name,
      email: normalizedEmail,
      password,
      phone,
      role: 'merchant'
    });

    const merchant = await DB.insert('merchants', {
      user_id: user.id,
      store_name,
      address,
      description: '',
      image_url: '',
      status: 'pending',
      is_onboarded: false,
      is_open: true,
      arrival_times: ''
    });

    res.status(201).json({ message: 'Registration successful. Waiting for admin approval.', merchant });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Merchant & Admin: Password Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const safeEmail = (email || '').trim().toLowerCase();
    const safePassword = (password || '').trim();
    const user = await DB.findOne('users', [{ field: 'email', op: '==', value: safeEmail }]);

    if (!user || (user.password !== password && user.password !== safePassword)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    let merchant = null;
    if (user.role === 'merchant') {
      merchant = await DB.findOne('merchants', [{ field: 'user_id', op: '==', value: user.id }]);
      if (merchant && merchant.status === 'pending') {
        return res.status(403).json({ error: 'Your merchant account is pending admin approval.' });
      }
    }

    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser, merchant });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// PRODUCT MANAGEMENT
// ─────────────────────────────────────────────

app.get('/api/products', async (req, res) => {
  try {
    const { category, search } = req.query;

    const approvedMerchants = await DB.query('merchants', [{ field: 'status', op: '==', value: 'approved' }]);
    const approvedIds = approvedMerchants.map(m => m.id);

    if (approvedIds.length === 0) return res.json([]);

    const allActiveProducts = await DB.query('products', [{ field: 'status', op: '==', value: 'active' }]);
    let list = allActiveProducts.filter(p => approvedIds.includes(p.merchant_id));

    if (category) {
      list = list.filter(p => p.category && p.category.toLowerCase() === category.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    list = list.map(p => {
      const m = approvedMerchants.find(merchant => merchant.id === p.merchant_id);
      return { ...p, store_name: m ? m.store_name : 'Basic Box Hub' };
    });

    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/merchant/:merchantId', async (req, res) => {
  try {
    const list = await DB.query('products', [{ field: 'merchant_id', op: '==', value: Number(req.params.merchantId) }]);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { merchant_id, name, description, price, fake_price, stock, category, image_url } = req.body;
    if (!merchant_id || !name || !price || !category) {
      return res.status(400).json({ error: 'Missing required product information.' });
    }

    const product = await DB.insert('products', {
      merchant_id: Number(merchant_id),
      name,
      description: description || '',
      price: Number(price),
      fake_price: fake_price ? Number(fake_price) : null,
      stock: Number(stock) || 0,
      category,
      image_url: image_url || '',
      status: 'active'
    });
    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const product = await DB.getById('products', id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const updated = await DB.update('products', id, {
      name: updates.name || product.name,
      description: updates.description !== undefined ? updates.description : product.description,
      price: updates.price !== undefined ? Number(updates.price) : product.price,
      fake_price: updates.fake_price !== undefined ? Number(updates.fake_price) : product.fake_price,
      stock: updates.stock !== undefined ? Number(updates.stock) : product.stock,
      category: updates.category || product.category,
      image_url: updates.image_url || product.image_url,
      status: updates.status || product.status
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const deleted = await DB.delete('products', req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found.' });
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────

app.post('/api/orders', async (req, res) => {
  try {
    const { user_id, merchant_id, items, delivery_address, delivery_landmark, total_amount } = req.body;
    if (!user_id || !merchant_id || !items || !items.length) {
      return res.status(400).json({ error: 'Invalid order request.' });
    }

    // Check and update stock
    for (const item of items) {
      const prod = await DB.getById('products', item.product_id);
      if (!prod) return res.status(400).json({ error: `Product ID ${item.product_id} no longer exists.` });
      if (prod.stock < item.quantity) return res.status(400).json({ error: `Insufficient stock for ${prod.name}.` });
      await DB.update('products', prod.id, { stock: prod.stock - item.quantity });
    }

    const driver = { name: 'Ramesh Kumar', phone: '+91 9486234190' };

    const order = await DB.insert('orders', {
      user_id: Number(user_id),
      merchant_id: Number(merchant_id),
      total: Number(total_amount),
      status: 'pending',
      delivery_address: delivery_address || '',
      delivery_landmark: delivery_landmark || '',
      driver_name: driver.name,
      driver_phone: driver.phone
    });

    for (const item of items) {
      await DB.insert('order_items', {
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price_at_time: item.price
      });
    }

    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/user/:userId', async (req, res) => {
  try {
    let orders = await DB.query('orders', [{ field: 'user_id', op: '==', value: Number(req.params.userId) }], { field: 'created_at', direction: 'desc' });
    const enriched = await Promise.all(orders.map(async o => {
      const merchant = await DB.getById('merchants', o.merchant_id);
      const orderItems = await DB.query('order_items', [{ field: 'order_id', op: '==', value: o.id }]);
      const items = await Promise.all(orderItems.map(async oi => {
        const prod = await DB.getById('products', oi.product_id);
        return { ...oi, name: prod ? prod.name : 'Unknown Product', price: oi.price_at_time };
      }));
      return { ...o, total_amount: o.total, store_name: merchant ? merchant.store_name : 'Basic Box Store', items };
    }));
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/merchant/:merchantId', async (req, res) => {
  try {
    let orders = await DB.query('orders', [{ field: 'merchant_id', op: '==', value: Number(req.params.merchantId) }], { field: 'created_at', direction: 'desc' });
    const enriched = await Promise.all(orders.map(async o => {
      const user = await DB.getById('users', o.user_id);
      const orderItems = await DB.query('order_items', [{ field: 'order_id', op: '==', value: o.id }]);
      const items = await Promise.all(orderItems.map(async oi => {
        const prod = await DB.getById('products', oi.product_id);
        return { ...oi, name: prod ? prod.name : 'Unknown Product', price: oi.price_at_time };
      }));
      return { ...o, total_amount: o.total, customer_name: user ? user.name : 'Guest', customer_phone: user ? user.phone : '', items };
    }));
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const order = await DB.getById('orders', id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if ((status === 'cancelled' || status === 'declined') && order.status !== 'cancelled' && order.status !== 'declined') {
      const items = await DB.query('order_items', [{ field: 'order_id', op: '==', value: order.id }]);
      for (const item of items) {
        const prod = await DB.getById('products', item.product_id);
        if (prod) await DB.update('products', prod.id, { stock: prod.stock + item.quantity });
      }
    }
    const updated = await DB.update('orders', id, { status });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// MERCHANTS
// ─────────────────────────────────────────────

app.get('/api/merchants/user/:userId', async (req, res) => {
  try {
    const merchant = await DB.findOne('merchants', [{ field: 'user_id', op: '==', value: Number(req.params.userId) }]);
    if (!merchant) return res.status(404).json({ error: 'Merchant profile not found' });
    res.json(merchant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/merchants', async (req, res) => {
  try {
    const merchants = await DB.query('merchants', [{ field: 'status', op: '==', value: 'approved' }]);
    res.json(merchants);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/merchants/:id/onboard', async (req, res) => {
  try {
    const { id } = req.params;
    const { store_name, address, image_url, arrival_times, description } = req.body;

    const merchant = await DB.getById('merchants', id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found.' });

    const updated = await DB.update('merchants', id, {
      store_name: store_name || merchant.store_name,
      address: address || merchant.address,
      description: description || merchant.description || '',
      image_url: image_url || merchant.image_url,
      arrival_times: arrival_times ? JSON.stringify(arrival_times) : merchant.arrival_times,
      is_onboarded: true
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/merchants/:id/settings', async (req, res) => {
  try {
    const { id } = req.params;
    const { store_name, address, image_url, is_open, description } = req.body;

    const merchant = await DB.getById('merchants', id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found.' });

    const updated = await DB.update('merchants', id, {
      store_name: store_name || merchant.store_name,
      address: address || merchant.address,
      description: description !== undefined ? description : merchant.description,
      image_url: image_url || merchant.image_url,
      is_open: is_open !== undefined ? is_open : merchant.is_open
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────

app.get('/api/admin/stats', async (req, res) => {
  try {
    const orders = await DB.query('orders');
    const users = await DB.query('users');
    const merchants = await DB.query('merchants');
    const orderItems = await DB.query('order_items');
    const products = await DB.query('products');

    const totalSales = orders
      .filter(o => o.status === 'delivered')
      .reduce((sum, o) => sum + o.total, 0);

    const salesByDay = {};
    const ordersByStatus = { pending: 0, accepted: 0, preparing: 0, packed: 0, out_for_delivery: 0, delivered: 0, cancelled: 0 };

    orders.forEach(o => {
      ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
      if (o.status === 'delivered') {
        const dateStr = new Date(o.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        salesByDay[dateStr] = (salesByDay[dateStr] || 0) + o.total;
      }
    });

    const categorySales = {};
    orderItems.forEach(item => {
      const parentOrder = orders.find(o => o.id === item.order_id);
      if (!parentOrder || parentOrder.status !== 'delivered') return;
      const prod = products.find(p => p.id === item.product_id);
      const cat = prod ? prod.category : 'Other';
      categorySales[cat] = (categorySales[cat] || 0) + (item.price_at_time * item.quantity);
    });

    const formattedCategorySales = Object.keys(categorySales).map(category => ({ category, sales: categorySales[category] }));

    let formattedSalesTrend = Object.keys(salesByDay).map(date => ({ date, amount: salesByDay[date] }));
    if (formattedSalesTrend.length < 5) {
      const today = new Date();
      const existingDates = new Set(formattedSalesTrend.map(pt => pt.date));
      for (let i = 4; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        if (!existingDates.has(dStr)) formattedSalesTrend.push({ date: dStr, amount: 0 });
      }
    }
    formattedSalesTrend.sort((a, b) => new Date(a.date + ' ' + new Date().getFullYear()) - new Date(b.date + ' ' + new Date().getFullYear()));

    res.json({
      total_sales: totalSales,
      orders_count: orders.length,
      users_count: users.filter(u => u.role === 'user').length,
      merchants_count: merchants.length,
      pending_merchants: merchants.filter(m => m.status === 'pending').length,
      sales_by_day: formattedSalesTrend,
      orders_by_status: ordersByStatus,
      category_sales: formattedCategorySales
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/merchants', async (req, res) => {
  try {
    const merchants = await DB.query('merchants');
    const enriched = await Promise.all(merchants.map(async m => {
      const user = await DB.getById('users', m.user_id);
      return { ...m, owner_name: user ? user.name : 'Unknown', owner_email: user ? user.email : '' };
    }));
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/merchants/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['approved', 'pending', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid merchant status.' });
    }
    if (!await DB.getById('merchants', id)) return res.status(404).json({ error: 'Merchant not found.' });
    const updated = await DB.update('merchants', id, { status });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Start Server
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`BASIC BOX BACKEND SERVER STARTED`);
  console.log(`Running locally at: http://localhost:${PORT}`);
  console.log('Database: MongoDB (Mongoose)');
  console.log('========================================');

  // Keep-alive: ping ourselves every 13 minutes to prevent Render from sleeping
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_URL;
  if (RENDER_URL) {
    setInterval(async () => {
      try {
        await fetch(`${RENDER_URL}/health`);
        console.log('[KEEP-ALIVE] Pinged self to stay awake');
      } catch (e) {
        console.log('[KEEP-ALIVE] Ping failed:', e.message);
      }
    }, 13 * 60 * 1000); // Every 13 minutes (Render sleeps at 15)
    console.log('[KEEP-ALIVE] Self-ping enabled — server will stay awake');
  }
});
