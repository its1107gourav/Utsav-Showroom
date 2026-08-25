# Utsav Showroom — CMS-enabled site

This package adds a real backend + admin CMS behind the frontend.

## What's inside

```
frontend/            The public site, plus:
  admin/              A separate admin dashboard (login, posts, inventory, categories)
  js/api-config.js    Set your backend URL here after deploying
  js/api-integration.js   Fetches admin-created posts into the existing category pages
  js/app.js           Card engine (hydrate/like/share/modal), booking button wiring
  js/sidebar.js        Mobile sidebar (Favorites/Login/My Orders/Admin Login) + dual-OTP admin login
  js/booking.js        Rent Now booking window, payment window, My Orders, Book a Slot
backend/             Node.js + Express + PostgreSQL (Prisma) + Cloudinary
```

## What admins can do (via /admin)

Login, create/edit/delete/archive posts, publish/unpublish, upload and replace
images by drag-and-drop (stored in Cloudinary, never on the server disk),
manage sections and subsections per post, manage features, manage
categories/subcategories, and **track inventory**: total units owned, units
currently reserved/rented, units damaged/in repair, a low-stock threshold
with dashboard alerts, optional cost price, and notes — all owner-only,
never shown publicly.

Multiple admin accounts are supported, but only one session is ever active
at a time — logging in anywhere signs out whatever session was active
before. A logged-in admin can add a brand-new admin account (different
email/password) from the "Manage Admins" page and remove any account,
including their own — the safe way to hand the business to a new owner
without sharing your personal login.

## Deploy order

1. **Database** — create a PostgreSQL instance (Render Postgres, Supabase, or Railway).
2. **Backend** — push to GitHub, deploy `/backend` to Render (use the included
   `backend/render.yaml`, or set it up manually). Fill in `DATABASE_URL`,
   `JWT_SECRET`, and your Cloudinary credentials as environment variables.
   Run `npx prisma migrate deploy` (the Render build command already does
   this). The first owner should be created via **Owner Login → First-Time
   Setup** on the live site itself (dual OTP, then they set their own
   password) — see the note on SMTP/SMS below. `npm run create-admin --
   you@example.com 9575929021 "YourPassword123"` from a Render shell is
   only a fallback if OTP delivery isn't configured yet.
3. **Import your existing catalog** — from the backend's Render shell (or
   locally against the production `DATABASE_URL`), run `npm run seed`. This
   reads `frontend/js/catalog-data.js` and creates matching categories and
   posts in the database, with a starting inventory record for each, without
   touching the static images/HTML already on the page.
4. **Frontend** — deploy `/frontend` to Vercel as a static site. Then edit
   `frontend/js/api-config.js` and set `window.MU_API_BASE` to your Render
   backend's public URL, and redeploy. **Every time you update this project,
   you must redeploy `/frontend` (and `/backend` if it changed) for the
   live site to reflect it** — the live URL always serves whatever was last
   deployed, not the files on your computer.

## Scope note on the frontend integration

Your original category pages render each of the ~855 existing images as
static HTML cards (by design — see the comments already in those files).
Rather than rewrite that into a JS-driven loop, `js/api-integration.js`
does two things on each category page load:

- **New posts** the admin creates from scratch get appended as additional
  cards, using the identical markup and CSS classes as the originals.
- **Existing migrated posts**: if the admin edits one of the original 855
  products (title, price, description, or cover image) through the admin
  panel, the script matches it back to its specific static card by image
  path and overwrites that card's visible text/image in place — so edits
  to existing products show up on refresh, not just brand-new ones.

Both fall back silently to the untouched static site if the API is
unreachable. Everything else in the spec (auth, uploads with real
Replace-in-place buttons for both gallery and cover images, sections,
subsections, features, inventory, persistence, categories) is fully wired
end to end.
