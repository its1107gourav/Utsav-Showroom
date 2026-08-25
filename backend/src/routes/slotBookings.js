// ============================================================
// "Book a Slot" — short appointment request from the Contact page's
// three premium sections (Wedding Rental / Beauty Parlour / Beauty
// Classes). Not a rental order — no payment, no size/dates-as-range,
// just a quick request the team follows up on by phone.
// ============================================================
const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in a few minutes.' },
});

const VALID_SECTIONS = ['Wedding Rental', 'Beauty Parlour', 'Beauty Classes'];

// POST /api/slot-bookings — public
router.post('/', limiter, async (req, res) => {
  const { section, name, phone, service, preferredDate, preferredTime, note } = req.body || {};
  if (!VALID_SECTIONS.includes(section)) return res.status(400).json({ error: 'Please choose a valid section.' });
  if (!name || !phone) return res.status(400).json({ error: 'Name and contact number are required.' });

  const booking = await prisma.serviceBooking.create({
    data: {
      section,
      name,
      phone: String(phone).replace(/\s+/g, '').trim(),
      service: service || null,
      preferredDate: preferredDate ? new Date(preferredDate) : null,
      preferredTime: preferredTime || null,
      note: note || null,
    },
  });
  res.status(201).json({ booking: { id: booking.id } });
});

// GET /api/slot-bookings — admin only (Manage Admins / Inventory Management)
router.get('/', requireAdmin, async (req, res) => {
  const bookings = await prisma.serviceBooking.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ bookings });
});

// PATCH /api/slot-bookings/:id — admin marks contacted/done
router.patch('/:id', requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'contacted', 'done'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const updated = await prisma.serviceBooking.update({ where: { id: req.params.id }, data: { status } });
  res.json({ booking: updated });
});

module.exports = router;
