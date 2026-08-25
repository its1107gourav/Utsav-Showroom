// Usage: node src/scripts/createAdmin.js admin@utsavshowroom.com 9575929021 "StrongPassword123" [name]
//
// Emergency/first-time fallback only. The normal way for an owner to
// get set up is Owner Login's dual-OTP flow on the live site (which
// verifies the phone number actually belongs to them before locking it
// in) — this script skips that verification, so only use it when you
// can't complete OTP verification for some reason (e.g. setting up a
// fresh environment with no SMTP/SMS configured yet).
//
// Owner Login now requires phone + email + password together, so a
// phone number is mandatory here — an admin created without one would
// be unable to log in afterward.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

async function main() {
  const [, , email, phone, password, name] = process.argv;
  if (!email || !phone || !password) {
    console.error('Usage: node src/scripts/createAdmin.js <email> <phone> <password> [name]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const normPhone = String(phone).replace(/\s+/g, '').trim();
  const passwordHash = await bcrypt.hash(password, 12);
  const totalAdmins = await prisma.admin.count();

  const admin = await prisma.admin.upsert({
    where: { email: email.toLowerCase().trim() },
    update: { passwordHash, phone: normPhone, phoneVerifiedAt: new Date(), name: name || undefined },
    create: {
      email: email.toLowerCase().trim(),
      phone: normPhone,
      phoneVerifiedAt: new Date(),
      passwordHash,
      name: name || null,
      isRoot: totalAdmins === 0,
    },
  });

  console.log(`Owner ready: ${admin.email} (${admin.isRoot ? 'root owner' : 'owner'})`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
