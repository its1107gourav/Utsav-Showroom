// ============================================================
// Orders + availability — public endpoints (no admin auth) used by the
// Visit / Rent Now / payment flow on the live site. No WhatsApp involved.
//
// The static category pages carry each product only as an image path
// (data-image) — there's no guarantee every one of the ~855 items has
// been through `npm run seed` yet. So bookings resolve/auto-create a
// lightweight Post row keyed on legacyImagePath, rather than requiring
// the full CMS seed first. If a matching Post already exists (from the
// seed or the admin panel), that same row is reused — no duplicates.
//
// Mounted twice from index.js: at /api/availability and /api/orders.
// ============================================================
const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');

const router = express.Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in a few minutes.' },
});

function slugifyFromPath(imagePath) {
  const base = imagePath.split('/').pop().replace(/\.[a-zA-Z0-9]+$/, '');
  return `${base}-${Math.abs(hashCode(imagePath))}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

async function resolvePost({ imagePath, productName, categoryKey, price }) {
  if (!imagePath) throw Object.assign(new Error('imagePath is required.'), { status: 400 });

  let post = await prisma.post.findFirst({ where: { legacyImagePath: imagePath } });
  if (post) return post;

  const category = categoryKey
    ? await prisma.category.findFirst({ where: { OR: [{ key: categoryKey }, { slug: categoryKey }] } })
    : null;

  post = await prisma.post.create({
    data: {
      title: productName || imagePath.split('/').pop(),
      slug: slugifyFromPath(imagePath),
      status: 'PUBLISHED',
      price: price != null ? Number(price) : null,
      legacyImagePath: imagePath,
      categoryId: category ? category.id : null,
      publishedAt: new Date(),
    },
  });
  return post;
}

function overlapsRange(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function findConflicts(postId, startDate, endDate, excludeOrderId) {
  const active = await prisma.bookingDate.findMany({
    where: {
      postId,
      status: { in: ['held', 'booked'] },
      ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
    },
  });
  const s = new Date(startDate);
  const e = new Date(endDate);
  return active.filter((b) => overlapsRange(s, e, b.startDate, b.endDate));
}

function validateBookingFields(b) {
  const errors = [];
  if (!b.imagePath) errors.push('Product is required.');
  if (!b.size) errors.push('Size is required.');
  if (!b.startDate) errors.push('Booking date is required.');
  if (!b.endDate) errors.push('Return date is required.');
  if (!b.time) errors.push('Time is required.');
  if (!b.days || Number(b.days) < 1) errors.push('Number of days is required.');
  if (!b.customerName) errors.push('Name is required.');
  if (!b.customerPhone) errors.push('Contact number is required.');
  if (!b.paymentMethod) errors.push('Payment method is required.');
  if (b.startDate && b.endDate && new Date(b.startDate) >= new Date(b.endDate)) {
    errors.push('Return date must be after the booking date.');
  }
  return errors;
}

// ---- AVAILABILITY ----

// POST /api/availability/check
// { imagePath, category, productName, startDate, endDate }
router.post('/check', writeLimiter, async (req, res) => {
  try {
    const { imagePath, category, productName, startDate, endDate } = req.body || {};
    if (!imagePath || !startDate || !endDate) {
      return res.status(400).json({ error: 'imagePath, startDate and endDate are required.' });
    }
    const post = await resolvePost({ imagePath, productName, categoryKey: category });
    const conflicts = await findConflicts(post.id, startDate, endDate);
    res.json({ available: conflicts.length === 0, conflicts: conflicts.map((c) => ({ startDate: c.startDate, endDate: c.endDate })) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to check availability.' });
  }
});

// ---- ORDERS ----

// GET /api/orders?phone=9575929021 — "My Orders" lookup, identified by phone
router.get('/', async (req, res) => {
  const phone = String(req.query.phone || '').replace(/\s+/g, '').trim();
  if (!phone) return res.status(400).json({ error: 'A phone number is required to look up orders.' });

  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) return res.json({ orders: [] });

  const orders = await prisma.order.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ orders });
});

// POST /api/orders — create a PENDING order + hold the date range.
// Validates every mandatory field and re-checks availability server-side
// (never trust the client's earlier /availability/check alone).
router.post('/', writeLimiter, async (req, res) => {
  const b = req.body || {};
  const errors = validateBookingFields(b);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  try {
    const post = await resolvePost({
      imagePath: b.imagePath,
      productName: b.productName,
      categoryKey: b.category,
      price: b.pricePerDay,
    });

    const conflicts = await findConflicts(post.id, b.startDate, b.endDate);
    if (conflicts.length) {
      return res.status(409).json({ error: 'These dates are no longer available for this item. Please choose different dates.', conflicts });
    }

    const phone = String(b.customerPhone).replace(/\s+/g, '').trim();
    const customer = await prisma.customer.upsert({
      where: { phone },
      update: { name: b.customerName, email: b.customerEmail || undefined },
      create: { name: b.customerName, phone, email: b.customerEmail || null },
    });

    const pricePerDay = Number(b.pricePerDay) || 0;
    const days = Number(b.days);
    const totalAmount = pricePerDay * days;
    const method = String(b.paymentMethod).toUpperCase();
    const isCod = method === 'COD';

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        postId: post.id,
        productName: b.productName || post.title,
        productImage: b.imagePath,
        size: b.size,
        startDate: new Date(b.startDate),
        endDate: new Date(b.endDate),
        days,
        purpose: b.purpose || null,
        pricePerDay,
        totalAmount,
        paymentMethod: method,
        paymentStatus: isCod ? 'COD_PENDING' : 'PENDING',
        status: 'PENDING_PAYMENT',
        bookings: {
          create: { postId: post.id, startDate: new Date(b.startDate), endDate: new Date(b.endDate), status: 'held' },
        },
      },
    });

    res.status(201).json({ order });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create order.' });
  }
});

// POST /api/orders/:id/confirm-cod — COD orders are confirmed on request,
// with no payment claim of any kind (per spec: "for COD, create the order
// only after confirmation" and "never fake successful payment status").
router.post('/:id/confirm-cod', writeLimiter, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentMethod !== 'COD') return res.status(400).json({ error: 'This order is not Cash on Delivery.' });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CONFIRMED' },
    });
    await prisma.bookingDate.updateMany({ where: { orderId: order.id }, data: { status: 'booked' } });
    res.json({ order: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to confirm order.' });
  }
});

// POST /api/orders/:id/confirm-payment — for UPI/Card/Netbanking.
// IMPORTANT: this project does not ship with a live payment gateway
// wired in. This endpoint intentionally requires a paymentRef that a
// real gateway's webhook/callback would supply, and will not mark an
// order paid without one — no payment status is ever faked. Once a
// gateway (Razorpay/Stripe/PayU/etc.) is connected, point its
// success callback at this endpoint with the transaction id.
router.post('/:id/confirm-payment', writeLimiter, async (req, res) => {
  const { paymentRef } = req.body || {};
  if (!paymentRef) {
    return res.status(400).json({ error: 'No payment gateway is connected yet, so this order cannot be marked paid. Please choose Cash on Delivery for now, or connect a payment gateway.' });
  }
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CONFIRMED', paymentStatus: 'PAID', paymentRef },
    });
    await prisma.bookingDate.updateMany({ where: { orderId: order.id }, data: { status: 'booked' } });
    res.json({ order: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to confirm payment.' });
  }
});

// POST /api/orders/:id/cancel — releases the held/booked date range
router.post('/:id/cancel', writeLimiter, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const updated = await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    await prisma.bookingDate.updateMany({ where: { orderId: order.id }, data: { status: 'released' } });
    res.json({ order: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order.' });
  }
});

module.exports = router;
