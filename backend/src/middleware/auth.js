const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

// Requires a valid admin JWT AND that its embedded sessionVersion still
// matches the admin's current sessionVersion in the database. Logging in
// anywhere bumps sessionVersion, which silently invalidates every other
// token that was issued before that login — so only one admin session can
// ever be active at a time, system-wide, with no explicit logout required
// on the other end.
async function requireAdmin(req, res, next) {
  const cookieToken = req.cookies && req.cookies.admin_token;
  const header = req.headers.authorization || '';
  const headerToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
    if (!admin) return res.status(401).json({ error: 'Invalid or expired session.' });
    if (admin.sessionVersion !== payload.sv) {
      return res.status(401).json({ error: 'You have been signed out because this account logged in elsewhere.' });
    }
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

module.exports = { requireAdmin };
