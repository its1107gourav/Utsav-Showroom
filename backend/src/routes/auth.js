const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');
const { sendEmailOtp, sendSmsOtp, generateOtp } = require('../lib/otpProviders');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Try again later.' },
});

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
const SETUP_TOKEN_TTL = '15m';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function signToken(admin) {
  return jwt.sign({ sub: admin.id, email: admin.email, sv: admin.sessionVersion }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function publicAdmin(admin) {
  return { id: admin.id, email: admin.email, name: admin.name, isRoot: admin.isRoot };
}

async function getOwnerSettings() {
  const existing = await prisma.ownerSettings.findUnique({ where: { id: 'singleton' } });
  return existing || { id: 'singleton', maxOwnerSlots: 1 };
}

async function completedOwnerCount() {
  return prisma.admin.count({ where: { passwordHash: { not: null } } });
}

// =====================================================================
// OWNER LOGIN (returning owner) — phone + email + password.
// This is the ONLY way to log in once an owner has completed setup
// (see the OTP bootstrap flow below for first-time setup). No OTP is
// needed here — three factors that must all match records on file.
// =====================================================================
router.post('/login', loginLimiter, async (req, res) => {
  const { email, phone, password } = req.body || {};
  if (!email || !phone || !password) {
    return res.status(400).json({ error: 'Email, contact number, and password are all required.' });
  }

  const normEmail = String(email).toLowerCase().trim();
  const normPhone = String(phone).replace(/\s+/g, '').trim();

  const admin = await prisma.admin.findUnique({ where: { email: normEmail } });
  // Deliberately generic error at every failure point below — never reveal
  // which of email/phone/password was wrong, or whether the email exists.
  if (!admin || !admin.passwordHash) return res.status(401).json({ error: 'Invalid credentials.' });
  if (admin.phone !== normPhone) return res.status(401).json({ error: 'Invalid credentials.' });

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

  const updated = await prisma.admin.update({
    where: { id: admin.id },
    data: { sessionVersion: { increment: 1 }, lastLoginAt: new Date() },
  });

  const token = signToken(updated);
  res.cookie('admin_token', token, COOKIE_OPTS);
  res.json({ admin: publicAdmin(updated) });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('admin_token', { ...COOKIE_OPTS, maxAge: undefined });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAdmin, async (req, res) => {
  const admin = await prisma.admin.findUnique({ where: { id: req.admin.sub } });
  if (!admin) return res.status(401).json({ error: 'Not found.' });
  res.json({ admin: publicAdmin(admin) });
});

// =====================================================================
// OWNER REGISTRATION — dual-OTP bootstrap (sidebar "Owner Login",
// first-time setup only). The very first person to complete this
// becomes the ROOT owner. After OTP verifies, they're issued a
// short-lived setup token (NOT a real session) and must set a password
// before the account is actually usable — see /owner-setup-password.
//
// How many owners can exist at once is controlled by OwnerSettings,
// which only the root owner may change (see /owner-settings below).
// By default only ONE owner slot exists — so by default, nobody else
// can complete this bootstrap flow until the root owner raises the
// limit or deletes their own account.
// =====================================================================

// POST /api/auth/admin-otp/request { email, phone }
router.post('/admin-otp/request', otpLimiter, async (req, res) => {
  const { email, phone } = req.body || {};
  if (!email || !phone) return res.status(400).json({ error: 'Email and contact number are required.' });

  const normEmail = String(email).toLowerCase().trim();
  const normPhone = String(phone).replace(/\s+/g, '').trim();

  const admin = await prisma.admin.findUnique({ where: { email: normEmail } });

  if (admin && admin.passwordHash) {
    return res.status(409).json({ error: 'This owner has already finished setup. Please log in with your email, contact number, and password instead.' });
  }
  if (admin && admin.phone && admin.phoneVerifiedAt && admin.phone !== normPhone) {
    return res.status(403).json({
      error: 'This contact number does not match the one on file for this owner. Ask the first owner to reset it from Inventory Management → Manage Owners.',
    });
  }
  if (!admin) {
    // Only brand-new bootstrap attempts count against the owner slot limit.
    const settings = await getOwnerSettings();
    const count = await completedOwnerCount();
    if (count >= settings.maxOwnerSlots) {
      return res.status(403).json({
        error: 'No owner slots are available right now. Ask the first owner to increase the owner limit from Manage Owners.',
      });
    }
  }

  const emailCode = generateOtp();
  const phoneCode = generateOtp();
  const emailCodeHash = await bcrypt.hash(emailCode, 10);
  const phoneCodeHash = await bcrypt.hash(phoneCode, 10);

  const challenge = await prisma.adminOtpChallenge.create({
    data: {
      email: normEmail,
      phone: normPhone,
      emailCodeHash,
      phoneCodeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  const [emailResult, smsResult] = await Promise.all([
    sendEmailOtp(normEmail, emailCode),
    sendSmsOtp(normPhone, phoneCode),
  ]);

  res.json({
    challengeId: challenge.id,
    expiresInSeconds: OTP_TTL_MS / 1000,
    // Surfaced only so the UI can tell the owner "check server logs" in
    // local/dev when no real SMTP/SMS provider is configured yet.
    devFallback: !!(emailResult.dev || smsResult.dev),
  });
});

// POST /api/auth/admin-otp/verify { challengeId, emailCode, phoneCode }
// On success, this does NOT log the owner in directly — it hands back a
// short-lived setup token that only authorizes setting a password next.
router.post('/admin-otp/verify', otpLimiter, async (req, res) => {
  const { challengeId, emailCode, phoneCode } = req.body || {};
  if (!challengeId || !emailCode || !phoneCode) {
    return res.status(400).json({ error: 'Both codes are required.' });
  }

  const challenge = await prisma.adminOtpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) return res.status(400).json({ error: 'This login attempt was not found. Request new codes.' });
  if (challenge.expiresAt < new Date()) return res.status(400).json({ error: 'These codes have expired. Request new ones.' });
  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many incorrect attempts. Request new codes.' });
  }

  const emailOk = await bcrypt.compare(String(emailCode), challenge.emailCodeHash);
  const phoneOk = await bcrypt.compare(String(phoneCode), challenge.phoneCodeHash);

  if (!emailOk || !phoneOk) {
    await prisma.adminOtpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return res.status(401).json({ error: 'One or both codes are incorrect.', emailOk, phoneOk });
  }

  let admin = await prisma.admin.findUnique({ where: { email: challenge.email } });

  if (admin && admin.passwordHash) {
    await prisma.adminOtpChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
    return res.status(409).json({ error: 'This owner has already finished setup. Please log in with your password instead.' });
  }

  if (!admin) {
    const totalAdmins = await prisma.admin.count();
    admin = await prisma.admin.create({
      data: { email: challenge.email, phone: challenge.phone, phoneVerifiedAt: new Date(), isRoot: totalAdmins === 0 },
    });
  } else if (!admin.phone || !admin.phoneVerifiedAt) {
    admin = await prisma.admin.update({
      where: { id: admin.id },
      data: { phone: challenge.phone, phoneVerifiedAt: new Date() },
    });
  }

  await prisma.adminOtpChallenge.delete({ where: { id: challenge.id } }).catch(() => {});

  const setupToken = jwt.sign({ sub: admin.id, kind: 'owner-setup' }, process.env.JWT_SECRET, { expiresIn: SETUP_TOKEN_TTL });
  res.json({ needsPasswordSetup: true, setupToken, expiresInSeconds: 15 * 60 });
});

// POST /api/auth/owner-setup-password { setupToken, password }
// Completes registration: sets the password and, only now, issues a
// real session — this is the moment the owner account becomes usable.
router.post('/owner-setup-password', otpLimiter, async (req, res) => {
  const { setupToken, password } = req.body || {};
  if (!setupToken || !password) return res.status(400).json({ error: 'Missing setup token or password.' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  let payload;
  try {
    payload = jwt.verify(setupToken, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'This setup session has expired. Please verify your OTP codes again.' });
  }
  if (payload.kind !== 'owner-setup') return res.status(401).json({ error: 'Invalid setup token.' });

  const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
  if (!admin) return res.status(404).json({ error: 'Owner account not found.' });
  if (admin.passwordHash) return res.status(409).json({ error: 'A password has already been set for this account.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await prisma.admin.update({
    where: { id: admin.id },
    data: { passwordHash, sessionVersion: { increment: 1 }, lastLoginAt: new Date() },
  });

  const token = signToken(updated);
  res.cookie('admin_token', token, COOKIE_OPTS);
  res.json({ admin: publicAdmin(updated) });
});

// =====================================================================
// OWNER SLOT LIMIT — how many owners may exist/complete setup at once.
// Only the root owner (the very first one ever created) may change
// this, and only after re-confirming their own password even though
// they're already logged in — a deliberate extra confirmation step
// since this controls who else can gain owner access to the site.
// =====================================================================

// GET /api/auth/owner-settings
router.get('/owner-settings', requireAdmin, async (req, res) => {
  const settings = await getOwnerSettings();
  const currentOwnerCount = await completedOwnerCount();
  res.json({ maxOwnerSlots: settings.maxOwnerSlots, currentOwnerCount });
});

// PATCH /api/auth/owner-settings { newMaxSlots, password }
router.patch('/owner-settings', requireAdmin, async (req, res) => {
  const admin = await prisma.admin.findUnique({ where: { id: req.admin.sub } });
  if (!admin || !admin.isRoot) return res.status(403).json({ error: 'Only the first owner can change the owner limit.' });

  const { newMaxSlots, password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Your password is required to confirm this change.' });

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect password.' });

  const n = Number(newMaxSlots);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Please enter a valid number of owner slots (1 or more).' });

  const count = await completedOwnerCount();
  if (n < count) return res.status(400).json({ error: `Cannot set the limit below the current number of owners (${count}).` });

  const settings = await prisma.ownerSettings.upsert({
    where: { id: 'singleton' },
    update: { maxOwnerSlots: n },
    create: { id: 'singleton', maxOwnerSlots: n },
  });
  res.json({ maxOwnerSlots: settings.maxOwnerSlots });
});

// PATCH /api/auth/admins/:id/phone — reset/replace a locked owner phone
// number. Only callable by an already-authenticated owner (Inventory
// Management → Manage Owners).
router.patch('/admins/:id/phone', requireAdmin, async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'A new contact number is required.' });
  const normPhone = String(phone).replace(/\s+/g, '').trim();
  try {
    const updated = await prisma.admin.update({
      where: { id: req.params.id },
      data: { phone: normPhone, phoneVerifiedAt: null }, // unlocked until next successful OTP verify
    });
    res.json({ admin: { id: updated.id, email: updated.email, phone: updated.phone } });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'That number is already registered to another owner.' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Owner not found.' });
    res.status(500).json({ error: 'Failed to update phone number.' });
  }
});

// ---- Owner account management (Manage Owners screen) ----

// GET /api/auth/admins — list all owner accounts
router.get('/admins', requireAdmin, async (req, res) => {
  const admins = await prisma.admin.findMany({
    select: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true, phone: true, phoneVerifiedAt: true, isRoot: true, passwordHash: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    admins: admins.map((a) => ({ ...a, passwordHash: undefined, setupComplete: !!a.passwordHash })),
    currentAdminId: req.admin.sub,
  });
});

// POST /api/auth/admins — manually create an owner account directly
// (email + password, no OTP). Kept as a fallback/emergency path, but
// still counts against the same owner slot limit as normal self-service
// bootstrap, so it can't be used to bypass the limit.
router.post('/admins', requireAdmin, async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const settings = await getOwnerSettings();
  const count = await completedOwnerCount();
  if (count >= settings.maxOwnerSlots) {
    return res.status(403).json({ error: 'No owner slots are available. Increase the owner limit first.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const totalAdmins = await prisma.admin.count();
    const admin = await prisma.admin.create({
      data: { email: email.toLowerCase().trim(), passwordHash, name: name || null, isRoot: totalAdmins === 0 },
    });
    res.status(201).json({ admin: publicAdmin(admin) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'An owner with that email already exists.' });
    res.status(500).json({ error: 'Failed to create owner.' });
  }
});

// DELETE /api/auth/admins/:id — remove an owner account. Refuses to
// delete the last remaining owner (nobody would be able to manage the
// site), and refuses to delete the root owner while other owners still
// exist (there would be nobody left who can manage the owner slot
// limit) — the root owner can only delete themself once they are the
// only owner left.
router.delete('/admins/:id', requireAdmin, async (req, res) => {
  const count = await prisma.admin.count();
  if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last remaining owner account.' });

  const target = await prisma.admin.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'Owner not found.' });
  if (target.isRoot) {
    return res.status(400).json({ error: 'The first owner cannot be deleted while other owner accounts still exist.' });
  }

  try {
    await prisma.admin.delete({ where: { id: req.params.id } });
    if (req.params.id === req.admin.sub) {
      res.clearCookie('admin_token', { ...COOKIE_OPTS, maxAge: undefined });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Owner not found.' });
    res.status(500).json({ error: 'Failed to delete owner.' });
  }
});

module.exports = router;
