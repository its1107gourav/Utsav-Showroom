// ============================================================
// OTP delivery providers — email (SMTP via nodemailer) and SMS
// (generic REST call, works with Twilio-compatible or MSG91-style APIs).
// ============================================================
// This project doesn't hardcode a specific SMS vendor. Set these env vars
// to go live; until then, codes are logged to the server console so the
// dual-OTP flow is fully testable end-to-end without a paid account:
//
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM   (email)
//   SMS_PROVIDER_URL, SMS_PROVIDER_AUTH_HEADER               (SMS, generic)
//     SMS_PROVIDER_URL is POSTed { to, message } with the header above.
//     For Twilio specifically, set SMS_PROVIDER_URL to your Messages
//     endpoint and SMS_PROVIDER_AUTH_HEADER to "Basic <base64 sid:token>".
//     For MSG91/other providers, adapt the fetch body below to their API.
// ============================================================

let nodemailerLib = null;
try { nodemailerLib = require('nodemailer'); } catch (e) { /* not installed until `npm install` runs */ }

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendEmailOtp(email, code) {
  const subject = 'Your Utsav Showroom admin login code';
  const text = `Your admin login code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`;

  if (!smtpConfigured() || !nodemailerLib) {
    console.warn(`[OTP:EMAIL] SMTP not configured — code for ${email} is ${code} (dev fallback, logged only).`);
    return { delivered: false, dev: true };
  }

  const transporter = nodemailerLib.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject,
    text,
  });
  return { delivered: true, dev: false };
}

async function sendSmsOtp(phone, code) {
  const message = `Your Utsav Showroom admin login code is ${code}. Expires in 10 minutes.`;

  if (!process.env.SMS_PROVIDER_URL) {
    console.warn(`[OTP:SMS] SMS provider not configured — code for ${phone} is ${code} (dev fallback, logged only).`);
    return { delivered: false, dev: true };
  }

  try {
    const res = await fetch(process.env.SMS_PROVIDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SMS_PROVIDER_AUTH_HEADER ? { Authorization: process.env.SMS_PROVIDER_AUTH_HEADER } : {}),
      },
      body: JSON.stringify({ to: phone, message }),
    });
    if (!res.ok) throw new Error(`SMS provider responded ${res.status}`);
    return { delivered: true, dev: false };
  } catch (err) {
    console.error('[OTP:SMS] delivery failed, falling back to console log:', err.message);
    console.warn(`[OTP:SMS] code for ${phone} is ${code}`);
    return { delivered: false, dev: true, error: err.message };
  }
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

module.exports = { sendEmailOtp, sendSmsOtp, generateOtp };
