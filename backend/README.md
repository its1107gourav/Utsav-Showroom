# Utsav Showroom — Backend + Admin CMS API

Node.js / Express / PostgreSQL (Prisma) API that powers the admin CMS behind
the Utsav Showroom frontend. Public read endpoints serve the live
site; every write endpoint requires an authenticated admin.

## 1. Local setup

```bash
cd backend
npm install
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, Cloudinary keys
npx prisma migrate dev --name init
npm run create-admin -- you@utsavshowroom.com 9575929021 "ChooseAStrongPassword123"
npm run dev                 # starts on http://localhost:4000
```

## 2. Import your existing catalog

Your current products live as hardcoded data in
`frontend/js/catalog-data.js`. To bring them into the database (so the admin
can edit them) without losing anything:

```bash
npm run seed
```

This is safe to re-run — it upserts by slug and will not overwrite posts
you've already edited from the admin panel.

## 3. Cloudinary (image storage)

Create a free account at cloudinary.com, then copy your Cloud Name, API Key,
and API Secret from the dashboard into `.env`. Uploaded images are never
written to the server's local filesystem — they go straight to Cloudinary,
and only the resulting URL is stored in Postgres.

## 4. API overview

Public (no auth):
- `GET /api/posts` — published posts (filter with `?category=`, `?subcategory=`, `?type=`)
- `GET /api/posts/:slug`
- `GET /api/categories`
- `GET /api/tags`

Admin-only (require `admin_token` cookie or `Authorization: Bearer <token>`):
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Full CRUD: `/api/posts`, `/api/categories`, `/api/categories/:id/subcategories`
- `/api/posts/:postId/sections`, `/api/sections/:id`, `/api/sections/reorder`
- `/api/sections/:sectionId/subsections`, `/api/subsections/:id`
- `/api/posts/:postId/features`, `/api/features/:id`, `/api/features/reorder`
- `/api/images/upload`, `/api/images/:id/replace`, `/api/images/:id`, `/api/images/reorder`
- `/api/inventory` — owner stock management (see below)

## 5. Inventory management (owner-only)

Every product post can carry an `InventoryItem`: total units owned, units
currently reserved/rented out, units out for cleaning/repair, a low-stock
threshold, an optional cost price, and free-text notes. None of this is ever
exposed on the public site — it's for the owner's `/admin` dashboard only.

- `GET /api/inventory` — full stock table, `?lowStock=1` to filter
- `GET /api/inventory/summary` — counts for a dashboard widget
- `PUT /api/inventory/:postId` — create/update stock for a product
- `PATCH /api/inventory/:postId/adjust` — quick +/- (e.g. "mark one as rented out")

## 6. Multiple admins, single active session, and business handover

Admin accounts are stored as a table, not a single hardcoded login — there
can be any number of them. Two things work together:

- **Only one admin session is ever valid system-wide.** Every login bumps
  that admin's `sessionVersion` in the database; the previous token (this
  account or any other admin's) is instantly invalidated. No explicit
  logout is required on the other end.
- **Owner Login (public sidebar)** is now a real self-service flow: dual
  OTP (phone + email) verifies identity, then the owner sets their own
  password — no admin needs to create their account for them. By default
  only ONE owner slot exists; the root owner (the very first one ever
  created) can raise that limit from `/admin/admins.html` → Manage Owners,
  confirming with their own password each time. Returning owners log in
  with email + phone + password (no OTP needed after the first time).
- **The `/admin/admins.html` page** also still supports manually creating
  an owner account directly (email + password, no OTP) as an emergency
  fallback — it counts against the same slot limit as the self-service
  flow, so it can't be used to bypass it. The root owner cannot be deleted
  while other owners still exist.
- The very first owner account can be created either by completing Owner
  Login's OTP flow on the live site, or via
  `npm run create-admin -- email phone password` (see step 1) if OTP
  delivery isn't configured yet in your environment.

## 7. Drag-and-drop image uploads

The cover-image and gallery upload areas in the post editor, and the
"Add New Item" floating window on the Posts page, are drag-and-drop zones —
drag a photo in or click to browse, same interaction as Google Drive's
upload area. No code editing is ever required to add, replace, or remove a
product photo.

## 8. Deploy

- **Database**: provision PostgreSQL (Render Postgres, Supabase, or Railway).
- **Backend**: push this repo to GitHub, create a Render Web Service pointed
  at `/backend` (or use the included `render.yaml` Blueprint), set the env
  vars from `.env.example`, deploy.
- **Frontend**: deploy `/frontend` to Vercel. Set `window.MU_API_BASE` in
  `frontend/js/api-config.js` to your Render backend's public URL.
