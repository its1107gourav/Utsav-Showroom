// ============================================================
// requireUser — verifies the "user_token" cookie (separate name and
// separate JWT payload shape from the existing admin_token, so the
// two systems can never be confused with each other or hijack one
// another's session). Backed by the same Postgres database as
// everything else in this project, via the existing Prisma client —
// User is just another table alongside Admin.
// ============================================================
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

async function requireUser(req, res, next) {
  const token = req.cookies?.user_token;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.kind !== 'user') return res.status(401).json({ error: 'Invalid session.' });

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

module.exports = { requireUser };
