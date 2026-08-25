// ============================================================
// User Authentication + Profile — real customer accounts, separate
// from the existing Owner/Admin system, but living in the SAME
// Postgres database (via the existing Prisma client) — just a
// different table. No second database, per project decision to keep
// Postgres/Prisma as the one and only datastore.
//
// Cookie name is "user_token" (the existing owner/admin system uses
// "admin_token") so the two sessions can never collide or be confused
// with each other, and a browser can even be logged in as both at once
// without conflict (though the frontend UI intentionally shows only
// one login option at a time per the role-visibility spec).
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { requireUser } = require('../middleware/userAuth');
const { upload, uploadBufferToCloudinary } = require('../lib/cloudinary');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

function signUserToken(user) {
  return jwt.sign({ sub: user.id, kind: 'user' }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    age: user.age,
    dateOfBirth: user.dateOfBirth,
    profileImage: user.profileImage,
    role: user.role,
    createdAt: user.createdAt,
  };
}

// POST /api/user-auth/register
router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required.' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const normEmail = String(email).toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normEmail } });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists — try logging in instead.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name: String(name).trim(), email: normEmail, passwordHash } });

  const token = signUserToken(user);
  res.cookie('user_token', token, COOKIE_OPTS);
  res.status(201).json({ user: publicUser(user) });
});

// POST /api/user-auth/login
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const normEmail = String(email).toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normEmail } });
  // Deliberately generic error — don't reveal whether the email is registered.
  if (!user) return res.status(401).json({ error: 'Incorrect email or password.' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });

  const token = signUserToken(user);
  res.cookie('user_token', token, COOKIE_OPTS);
  res.json({ user: publicUser(user) });
});

// POST /api/user-auth/logout
// Actually clears the session server-side (not a visual-only button):
// the cookie is invalidated with matching options so the browser drops
// it, and there is no server-side session store to also clear (JWT is
// stateless) — once the cookie is gone, requireUser rejects every
// subsequent request until a fresh login issues a new token.
router.post('/logout', (req, res) => {
  res.clearCookie('user_token', COOKIE_OPTS);
  res.json({ ok: true });
});

// GET /api/user-auth/me — used by the frontend on every page load to
// decide whether to show "Login" or "Profile + Logout" in the UI.
router.get('/me', requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// PUT /api/user-auth/me — edit own profile only. The user id is taken
// from the verified JWT (req.user, set by requireUser), never from
// anything the client sends — so User A can never edit User B's
// profile by passing a different id in the request body.
router.put('/me', requireUser, async (req, res) => {
  const { name, age, dateOfBirth } = req.body || {};
  const updates = {};

  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty.' });
    updates.name = String(name).trim();
  }
  if (age !== undefined) {
    const n = Number(age);
    if (age !== null && (Number.isNaN(n) || n < 0 || n > 130)) return res.status(400).json({ error: 'Please enter a valid age.' });
    updates.age = age === null || age === '' ? null : n;
  }
  if (dateOfBirth !== undefined) {
    if (dateOfBirth && Number.isNaN(new Date(dateOfBirth).getTime())) return res.status(400).json({ error: 'Please enter a valid date of birth.' });
    updates.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
  }

  const updated = await prisma.user.update({ where: { id: req.user.id }, data: updates });
  res.json({ user: publicUser(updated) });
});

// POST /api/user-auth/me/profile-image — reuses the same Cloudinary
// upload pipeline (and file-type/size validation) already used for
// product images elsewhere in this project.
router.post('/me/profile-image', requireUser, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'No image file received.' });

    try {
      const result = await uploadBufferToCloudinary(req.file.buffer);
      const updated = await prisma.user.update({ where: { id: req.user.id }, data: { profileImage: result.secure_url } });
      res.json({ user: publicUser(updated) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Image upload failed. Please try a different image.' });
    }
  });
});

module.exports = router;
