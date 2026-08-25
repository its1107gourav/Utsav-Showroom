require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const categoryRoutes = require('./routes/categories');
const sectionRoutes = require('./routes/sections');
const featureRoutes = require('./routes/features');
const imageRoutes = require('./routes/images');
const tagRoutes = require('./routes/tags');
const inventoryRoutes = require('./routes/inventory');
const ordersRoutes = require('./routes/orders');
const slotBookingsRoutes = require('./routes/slotBookings');
const userAuthRoutes = require('./routes/userAuth');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    // Allow non-browser tools (no origin header) and any configured origin.
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'utsav-showroom-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api', sectionRoutes);   // exposes /api/posts/:postId/sections, /api/sections/:id, /api/subsections/:id
app.use('/api', featureRoutes);   // exposes /api/posts/:postId/features, /api/features/:id
app.use('/api/images', imageRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/availability', ordersRoutes); // exposes POST /api/availability/check
app.use('/api/orders', ordersRoutes);       // exposes GET/POST /api/orders, /:id/confirm-*, /:id/cancel
app.use('/api/slot-bookings', slotBookingsRoutes);
app.use('/api/user-auth', userAuthRoutes); // real customer accounts — same Postgres DB, separate table from Admin/Owner

// Not-found + error handlers
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Utsav Showroom backend listening on port ${PORT}`));
