# Utsav Showroom — Implementation Modules

This is the whole spec broken into independent modules. Each one lists
exactly what it touches, its status, and — most importantly — how to
verify **just that module** on its own, so we can go through them one at
a time instead of trying to eyeball the entire site at once.

Legend: ✅ Done & verified in code · 🟡 Done, needs your real credentials to fully test · ⬜ Not started

---

## M1 — Brand & Marketing Copy
**Status: ✅**
Renames "Maison Utsav" → "Utsav Showroom" and "Studio" → "Parlour"
everywhere (titles, meta tags, nav, footer, admin panel, share text,
product blurbs, code comments), removes every hardcoded catalog count
("855 looks", "14 collections"), replaces with premium copy.

- **Files:** all 20 frontend HTML pages, `frontend/js/app.js`,
  `frontend/js/catalog-data.js`, `frontend/admin/*.html`, backend
  `index.js`/`cloudinary.js`/`createAdmin.js`, both `README.md`s.
- **Verify:** open any page, search page source for "maison" or "855" —
  should be zero hits. Click the Share (⤴) icon on any product card and
  check the copied text says "Utsav Showroom".

## M2 — Rental Pricing Fix
**Status: ✅**
The original catalog priced the 7 rental categories per **3-day
package** (₹6,500–17,000), not per day — this violated the "under
₹4,000/day" rule and would have broken the booking flow's days × price
math. Rescaled to true per-day rates in both the DB-seed source and the
client-only fallback.

- **Files:** `frontend/js/catalog-data.js`, `frontend/js/app.js`
  (`CATEGORY_META`).
- **Verify:** open any rental category page (e.g. `pages/bridal-wear.html`),
  check every card's price is under ₹4,000 and reads "/ day".

## M3 — Navigation: Home Link + Hamburger
**Status: ✅**
Injects a "Home" text link next to the wordmark and a hamburger icon
into the nav bar on every page, via one shared script (no per-page HTML
editing needed for future nav changes).

- **Files:** `frontend/js/sidebar.js`, `frontend/css/enhance.css`.
- **Verify:** any page — "Home" link and ☰ icon should appear in the nav
  immediately on load.

## M4 — Mobile Sidebar Drawer
**Status: ✅**
Slide-in drawer (backdrop, animation, correct z-index) with Home /
Collections / Spotlight / Parlour / Classes / Contact, an Account
section (Favorites / Login / My Orders), and Admin Login pinned at the
bottom.

- **Files:** `frontend/js/sidebar.js`, `frontend/css/enhance.css`.
- **Verify:** click ☰ → drawer slides in from the right, backdrop
  dims the page, ✕ or backdrop click closes it, Esc closes it.

## M5 — Favorites / Login / My Orders panels
**Status: ✅** (Favorites, Login), **🟡** (My Orders — needs backend running)
Favorites reads the existing like-list from localStorage. Login/Profile
is a lightweight name+phone identity (no password) so returning
customers don't retype details. My Orders looks up orders by phone
number from the backend.

- **Files:** `frontend/js/booking.js`.
- **Verify:** like a few products (♡ icon), open sidebar → Favorites,
  confirm they show. Sidebar → Login/Profile → save a name+phone,
  reopen → confirm it's remembered.

## M6 — Homepage Hero: Vertical Film-Reel
**Status: ✅**
Replaces the 4-photo tilted collage with an auto-scrolling vertical
reel (3 cards visible, clip-masked top/bottom, pauses on hover), each
card linking to its category page.

- **Files:** `frontend/index.html`, `frontend/css/enhance.css`.
- **Verify:** open `index.html` — right side of hero should be a tall
  scrolling strip, not a static collage. Click any reel card → lands on
  that category page.

## M7 — Collections: Portrait Tiles + 4-Column Grid
**Status: ✅ (updated)**
Collection tiles and category-page product cards are now sized to each
image's real aspect ratio — no cropping. Portrait product photos stay
tall and narrow, square ones stay square, landscape ones stay wide.
Built as a CSS-columns masonry layout (rather than fixed-height grid
rows) since that's the only way to size a box around real image
dimensions instead of forcing a crop. Also made noticeably smaller —
more, smaller cards per row instead of large 4-across tiles.

- **Files:** `frontend/css/enhance.css` (overrides `.bento`/`.tile` and
  `.grid`/`.card-photo` from the original `sections.css`/`base.css` —
  no HTML changed).
- **Verify:** `collections.html` tiles should be noticeably smaller and
  each shaped like its photo (no stretching/cropping). Any category
  page (e.g. `pages/bridal-wear.html`) should show 5 smaller cards per
  row on desktop, each card's photo area matching that image's real
  shape.

## M8 — Product Actions: Visit + Rent Now
**Status: ✅**
Every one of the 855 product cards now has two buttons instead of one
WhatsApp-linked button: **Visit** (opens the existing full-detail modal)
and **Rent Now** (opens the new booking window). No WhatsApp anywhere
in the purchase flow.

- **Files:** all 13 `frontend/pages/*.html` (scripted replacement),
  `frontend/js/app.js` (click handling).
- **Verify:** on any category page, each card has two buttons. "Visit"
  opens the detail modal; "Rent Now" opens the booking window directly.

## M9 — Rental Booking Window
**Status: ✅**
Floating window: product name/image, size, availability check,
booking date, return date, time, auto-computed number of days, purpose
(optional), Proceed. Validates every mandatory field and re-checks
availability before proceeding.

- **Files:** `frontend/js/booking.js`, `frontend/css/enhance.css`.
- **Verify:** click "Rent Now" on any product → fill the form → try
  submitting with a field missing (should show an inline error) → try
  return date before booking date (should error) → fill correctly →
  proceeds to Payment.

## M10 — Payment Window + Orders
**Status: 🟡** (COD fully functional; online methods need a real gateway)
Floating payment window: UPI / Card / Netbanking / COD, with loading /
success / error / cancellation states. Creates a real order against the
backend. **COD confirms immediately for real.** UPI/Card/Netbanking
create the order but stay "Pending Payment" — never faked as paid,
since no payment gateway is connected yet.

- **Files:** `frontend/js/booking.js`, `backend/src/routes/orders.js`,
  Prisma `Order`/`BookingDate`/`Customer` models.
- **Verify (needs backend running):** complete a booking with COD →
  should show "Order Confirmed" → check My Orders shows it as
  Confirmed. Complete one with UPI → should show it was placed but
  needs manual confirmation (Pending Payment).
- **Still needed from you:** which payment gateway (Razorpay / Stripe /
  PayU / other) so I can wire `POST /api/orders/:id/confirm-payment` to
  its real success callback.

## M11 — Availability Checking
**Status: ✅**
Server-side date-range conflict detection per product, backed by a
`BookingDate` table. Checked once live as the customer picks dates, and
re-checked authoritatively when the order is actually created (never
trusts the client-side check alone). Cards from different pages
referencing the same image are normalized to the same product record,
so conflicts are caught regardless of which page the booking started
from.

- **Files:** `backend/src/routes/orders.js` (`resolvePost`,
  `findConflicts`), Prisma `BookingDate` model.
- **Verify (needs backend running):** book a product for specific
  dates and confirm it (COD). Try booking the *same* product for
  overlapping dates from a different page → should be rejected with a
  clear "not available" error.

## M12 — Admin Dual-OTP Login
**Status: 🟡** (fully built; OTP delivery logs to console until you add
SMTP/SMS credentials)
Sidebar → Admin Login opens a floating window asking for phone + email,
sends one OTP to each, requires both to verify server-side before
opening the existing Inventory Management dashboard. Real
server-side session (cookie), not a frontend-only flag.

- **Files:** `frontend/js/sidebar.js`, `backend/src/routes/auth.js`,
  `backend/src/lib/otpProviders.js`, Prisma `AdminOtpChallenge` model.
- **Verify (needs backend running, no credentials required for this
  test):** sidebar → Admin Login → enter a registered admin's email +
  any phone number → check the backend's console log for the two 6-digit
  codes (since no SMTP/SMS is configured yet) → enter both → should land
  on the dashboard.
- **Still needed from you:** SMTP credentials (any provider — Gmail app
  password works) and, optionally, an SMS provider, in `backend/.env`.

## M13 — Admin Phone Locking + Reset
**Status: ✅**
The first phone number an admin verifies through OTP login is locked to
that account; a mismatched number is rejected with a clear message.
Reset available from Inventory Management → Manage Admins.

- **Files:** `backend/src/routes/auth.js` (`PATCH
  /admins/:id/phone`), `frontend/admin/admins.html`.
- **Verify (needs backend running):** complete M12 once (locks the
  number) → try OTP login again with a *different* phone number for the
  same email → should be rejected. Go to Manage Admins → "Reset number"
  → try again with the new number → should work.

## M14 — Contact Page: Three Sections + Book a Slot
**Status: ✅**
Contact restructured into Wedding Rental / Beauty Parlour / Beauty
Classes cards, each opening a short floating "Book a Slot" form (name,
contact, service, preferred date/time, note) instead of a bottom-of-page
form. Real phone number (9575929021) displayed.

- **Files:** `frontend/contact.html`, `frontend/js/booking.js`,
  `backend/src/routes/slotBookings.js`, Prisma `ServiceBooking` model.
- **Verify:** open `contact.html` → three cards visible → click one →
  floating form opens → submit (needs backend running to actually save).

## M15 — Dark Mode: Solid Premium Colors
**Status: ✅**
Night theme's gradient buttons/text (wordmark, nav CTA, solid buttons,
hero headline accent, CTA band) converted to solid colors — wine/
burgundy/black with muted gold and cream/pink highlights — instead of
gradients.

- **Files:** `frontend/css/enhance.css` (section 5).
- **Verify:** toggle to night mode (moon icon in nav) on any page,
  check buttons and headline accents are flat solid colors, not
  gradients.

## M16 — Homepage: Beauty Classes Section
**Status: ✅**
Added a dedicated homepage teaser section linking to Beauty Classes
(previously only reachable via nav).

- **Files:** `frontend/index.html`.
- **Verify:** scroll homepage — a "Learn the craft, not just book it"
  band should appear between the Parlour section and Collections.

## M17 — Groom Wear / Parlour Parity
**Status: ✅ (verified, no rebuild needed)**
Checked `groom-wear.html` against `bridal-wear.html` — same card
architecture, same detail-modal wiring, 121 fully detailed items. No
gap to fix. Parlour page (`studio.html`) already has full 5-discipline
service ledger; renamed Studio → Parlour throughout.

- **Verify:** compare `pages/groom-wear.html` and `pages/bridal-wear.html`
  side by side — same layout quality, Visit/Rent Now on every card.

## M18 — Final Mobile / Cross-Page QA
**Status: ⬜ Not done — this is the next module**
Section 17 of your spec: full pass on mobile widths, dark mode, sidebar
open/close, every click target, console errors, overflow/z-index
issues, across all 20 pages.

---

## M19 — Nav Spacing Fix
**Status: ✅**
The Home link was originally inserted right next to the wordmark, but
the nav uses `justify-content: space-between` across three groups
(wordmark / nav-links / nav-right) — so Home ended up stranded far from
the actual Collections/Spotlight/Parlour/etc. buttons. Moved it to be
the first item inside `.nav-links` itself, so it's grouped tightly with
the rest.

- **Files:** `frontend/js/sidebar.js`.
- **Verify:** on any page, "Home" should sit directly beside
  "Collections" with the same spacing as the other nav buttons.

## M20 — Collection Tiles: Click Anywhere to Navigate
**Status: ✅**
Previously, clicking a collection tile's photo opened a quick-preview
modal, and only the small "View Collection →" text actually navigated
to the category page. Now clicking anywhere on the tile goes straight
to that category page.

- **Files:** `frontend/js/app.js`.
- **Verify:** on `collections.html` (or the homepage bento/beauty-band),
  click anywhere on a tile's photo — should navigate immediately to that
  category page, not open a popup.

## M21 — User Login (navbar) vs Admin Login (sidebar) — kept separate
**Status: ✅**
Added a standalone "Login" button directly in the navbar (next to the
hamburger), separate from the existing sidebar "Admin Login". This is
the same lightweight name+phone customer identity as before (no
password, used for My Orders/prefill) — it does **not** grant access to
Inventory Management. Inventory Management stays reachable only through
Admin Login's dual-OTP flow, unchanged, exactly as before.

- **Files:** `frontend/js/sidebar.js`, `frontend/css/enhance.css`.
- **Verify:** navbar now shows a "Login" button (desktop widths). Click
  it → same profile window as sidebar → Login/Profile. Save a name — the
  navbar button relabels to show the first name. Try Admin Login from
  the sidebar separately — still asks for the dual OTP, unaffected.

## M22 — New "Garba Dresses" Category (empty, admin-managed)
**Status: ✅ (page + nav live; content added by you via the existing
admin panel — not touched or rebuilt)**
Added "Garba Dresses" to the top nav on all 20 pages (and the mobile
sidebar), linking to a brand-new, intentionally empty category page.
It shows a "new looks coming soon" placeholder until populated — no
static cards were added. The existing `api-integration.js` bridge
already knows how to fetch published posts for a category slug and
inject them as live cards, so the page fills in automatically the
moment you add items to it.

- **Files:** `frontend/pages/garba-dresses.html` (new), nav links added
  across all other 19 pages, `frontend/js/sidebar.js`.
- **To populate it:** in the existing Admin → Categories page, add a
  category with slug `garba-dresses` (if it doesn't already exist),
  then add posts under Admin → Posts and assign them to it — they'll
  appear on this page automatically. Nothing about the hidden Inventory
  Management panel itself was changed.
- **Verify:** open `pages/garba-dresses.html` — should show the "coming
  soon" note and no cards, with the page/nav otherwise looking identical
  in style to every other category page.

## M23 — Homepage Section Order: Collections before Parlour, Beauty Classes last
**Status: ✅**
Swapped Collections/Parlour order, then moved the Beauty Classes teaser
to be the last section on the page (right before the footer).

- **Files:** `frontend/index.html`.
- **Final order:** Hero → Collections → Parlour (service tiles) →
  Service Ledger → "Reserve Your Date" CTA band → Beauty Classes →
  Footer.
- **Verify:** scroll the homepage all the way down — "Learn the craft,
  not just book it" (Beauty Classes) should be the last section before
  the footer.

---

## M24 — Hero Reel Redesign: Title Header + Square Image
**Status: ✅**
Each reel item is now a real card: a stylish title band on top (not
text overlaid on the photo) and a normal square image box below — no
more heavily-cropped, over-zoomed rectangles.

- **Files:** `frontend/index.html`, `frontend/css/enhance.css`.
- **Verify:** homepage hero — each reel card should show its category
  name in its own text band, then a clean square photo beneath it.

## M25 — Collections: Removed Studio Details, Renamed Features, Fixed Sizing
**Status: ✅**
- "Studio Details" tile removed entirely from the Collections section
  (both `index.html` and `collections.html`).
- "Features" renamed to "Parlour Services".
- Reverted to fixed-size tiles (image fills the box, cropped as needed
  — no empty space): Bridal Wear & Groom Wear match each other (large);
  Bridal Jewellery / Groom Jewellery / Pagdi & Safa match each other
  (medium); Parlour Services & Nail Art are shorter than the rest.

- **Files:** `frontend/index.html`, `frontend/collections.html`,
  `frontend/css/enhance.css`.
- **Verify:** Collections section — no Studio Details tile, "Parlour
  Services" label visible, Bridal/Groom Wear same size, the three
  jewellery/pagdi tiles match each other, Parlour Services + Nail Art
  are visibly shorter than the others.

## M26 — Category Pages: Uniform Card Size
**Status: ✅**
Reverted from the earlier natural-aspect-ratio masonry layout back to
fixed, equal-size cards within each category page — every card the
same box, image cropped to fill with no empty space.

- **Files:** `frontend/css/enhance.css`.
- **Verify:** any category page — every card should be the same size,
  regardless of the source image's original shape.

## M27 — Nav: Home Spacing Fixed, Nav-Only Menu Links Removed from Sidebar
**Status: ✅**
Home now sits tightly grouped with the other nav buttons. The
sidebar's "Menu" section (Home/Collections/Spotlight/Parlour/Beauty
Classes/Garba Dresses/Contact — all duplicates of the top nav) was
removed entirely; the sidebar now only has Account actions and Admin
Login.

- **Files:** `frontend/js/sidebar.js`.
- **Verify:** open the sidebar — should show only Favorites, Login/
  Profile, My Orders, Book Parlour Appointment, Book Rental
  Appointment, Book Class, and Admin Login. No page-navigation links.

## M28 — Sidebar: Quick Booking Shortcuts
**Status: ✅**
Added "Book Parlour Appointment", "Book Rental Appointment", and "Book
Class" to the sidebar's Account section — each opens the existing Book
a Slot window pre-set to that section, reusing the same backend
(`/api/slot-bookings`) as the Contact page.

- **Files:** `frontend/js/sidebar.js`.
- **Verify:** sidebar → each of the three buttons opens the floating
  booking form with the correct section already selected.

## M29 — Back Button on Every Page
**Status: ✅**
A floating "← Back" button now appears on every page except the
homepage, using browser history (falls back to Home if there's no
history to go back to).

- **Files:** `frontend/js/sidebar.js`, `frontend/css/enhance.css`.
- **Verify:** navigate from Home → any category page — a "← Back"
  button should appear near the top-left; clicking it returns to the
  previous page.

## M30 — Homepage: New "In Detail" Spotlights + Classes Repositioned
**Status: ✅**
Added "Groom Wear, in detail" and "Groom Jewellery, in detail"
spotlight rows (real catalog images) alongside the existing Bridal
Wear/Jewellery/Makeup ones. Added a "Garba Dresses, in detail" spotlight
too — as copy + a CTA rather than an image row, since that category has
no catalog images yet. Beauty Classes was redesigned into a bigger
image+copy feature band and moved to sit right before the Service
Ledger (Parlour services) section, instead of being last.

- **Files:** `frontend/index.html`, `frontend/css/enhance.css`.
- **Verify:** scroll the homepage — new Groom Wear, Groom Jewellery,
  and Garba Dresses spotlight rows should appear after the existing
  ones; the redesigned Beauty Classes band (image + checklist) should
  sit right before "At The Parlour — The service ledger."

---

## M31 — Collections: Exact 3-Row Layout
**Status: ✅**
Rebuilt the Collections section as three fixed rows, per your exact
spec:
- Row 1 — Bridal Wear, Groom Wear, Couple Sets: 300×400px, only these 3.
- Row 2 — Bridal Jewellery, Groom Jewellery, Pagdi & Safa, Juti &
  Footwear: 300×300px, only these 4.
- Row 3 — everything else (Hair Styling, Nail Art, Makeup Looks, Parlour
  Services, Nail Care, Face Care): 200×300px.

Each row never wraps — if the exact pixel widths don't all fit the
screen, every card in that row shrinks by the same proportion (width
and height together) until they do, exactly as specified.

**One note:** you said Row 3 should have "only these five cards," but
after removing Studio Details earlier and grouping the named categories
into Rows 1–2, there are six categories left over (Hair Styling, Nail
Art, Makeup Looks, Parlour Services, Nail Care, Face Care) — since you
also said "don't make any other changes," I kept all six rather than
deleting one arbitrarily. Tell me which one (if any) should come out if
you did mean exactly five.

- **Files:** `frontend/collections.html`, `frontend/index.html`,
  `frontend/css/enhance.css`.
- **Verify:** Collections section — Row 1 shows exactly Bridal Wear/
  Groom Wear/Couple Sets at the taller 300×400 size; Row 2 shows exactly
  the 4 named categories at 300×300; Row 3 shows the remaining
  categories at 200×300.

---

## M32 — Collections Row Sizes Updated + Beauty Classes & Hero Reel Resized
**Status: ✅**
- Row 1 is now 400×500px and includes a 4th card, **Makeup Looks**
  (moved out of Row 3), alongside Bridal Wear, Groom Wear, Couple Sets.
- Row 3 (the remaining 5 categories: Hair Styling, Nail Art, Parlour
  Services, Nail Care, Face Care) is now 320×450px.
- Row 2 unchanged at 300×300px.
- Beauty Classes homepage image is now fixed at 500×700px instead of
  stretching to fill its column.
- Hero vertical reel cards are now 450×600px (photo portion), instead
  of a small square — the peephole window height was increased to
  600px so a full card is visible at a time.

- **Files:** `frontend/collections.html`, `frontend/index.html`,
  `frontend/css/enhance.css`.
- **Verify:** Collections Row 1 shows 4 cards (incl. Makeup Looks) at
  the taller 400×500 size; Row 3 no longer has Makeup Looks and its 5
  remaining cards are 320×450; the Beauty Classes photo is tall
  (500×700) rather than stretched full-width; the hero reel cards are
  noticeably larger (450×600 photo) than before.

---

## M33 — Row 1 Height + Hero Reel Container Resized to Match Image
**Status: ✅**
- Collections Row 1 height changed to 550px (width unchanged at 400px).
- The hero reel's outer container (the actual scrollbar/viewport, not
  just the cards inside it) is now sized to exactly match the image —
  450px wide × 600px tall — instead of stretching to fill its half of
  the hero and leaving empty space around a narrower card.

- **Files:** `frontend/css/enhance.css`.
- **Verify:** Collections Row 1 cards are visibly taller (400×550).
  Hero reel — the whole scrolling panel should be exactly as wide as
  the cards inside it (no empty background bleeding around the sides),
  sized 450×600.

---

## M34 — Category Cards: 70% Photo / 30% Info Split
**Status: ✅**
Every category-page card is now a fixed 560px tall (shrinking on
smaller screens), with the photo taking exactly 70% of that height and
the name/rating/availability/price/buttons section taking only 30% —
instead of the photo and info section being close to equal size.
Tightened the info section's padding/gaps/font sizes slightly so
everything still fits comfortably in less space.

- **Files:** `frontend/css/enhance.css`.
- **Verify:** any category page (e.g. `pages/bridal-wear.html`) — the
  photo should visibly dominate each card, with a noticeably slimmer
  info strip underneath it, roughly a 70/30 split.

---

## M35 — Category Cards Compressed 20% (10% off Photo, 10% off Info)
**Status: ✅**
Reduced the fixed card height by 20% (560px → 448px on desktop),
taking the reduction as 10 percentage-points of the original total off
each section individually: photo 392px → 336px, info 168px → 112px
(112 + 336 = 448, exactly the new total). Scaled proportionally at
every breakpoint. Applies only to subsection/category-page cards, not
the homepage or Collections tiles.

- **Files:** `frontend/css/enhance.css`.
- **Verify:** any category page — cards should be visibly more compact
  than the previous pass, with both the photo and the info strip
  noticeably shorter, not just one of them.

---

## M35 — Category Cards: Info Section No Longer Overflows
**Status: ✅**
Photo height is now untouched/fixed (336px) going forward. The info
section was grown by 3% of the card's total height (112px → 125px) and
its internal line-height/gaps tightened further, so name, rating,
availability, price, and both buttons fit inside the box without any
content spilling outside it. The card's total height is now `auto` (=
photo + info, exactly) instead of a fixed number that content had to
squeeze into — so this class of overflow bug can't recur.

- **Files:** `frontend/css/enhance.css`.
- **Verify:** any category page — no button or price text should be
  cut off or overflow past the bottom edge of any card.

## M36 — Hero Reel: Frame Slightly Wider Than the Image
**Status: ✅**
The reel's outer panel is now 20px wider than the card/image inside it
(470px vs. 450px), so the photo reads as sitting inside a frame rather
than being an exact, edge-to-edge fit with the scrollbar.

- **Files:** `frontend/css/enhance.css`.
- **Verify:** homepage hero — a thin margin of the panel's background
  should be visible on either side of each reel card.

---

## M37 — "Features & Wallpapers" Renamed to "Parlour Services" Everywhere
**Status: ✅**
Fixed the gap from M25 — the Collections tile was renamed earlier, but
the actual page itself (title, meta, breadcrumb, H1, intro line) and
its references from `collections.html`, `index.html` (alt text), and
`spotlight.html` (spotlight row heading) still said "Features &
Wallpapers." All now say "Parlour Services."

- **Files:** `frontend/pages/features.html`, `frontend/collections.html`,
  `frontend/index.html`, `frontend/spotlight.html`.
- **Verify:** open `pages/features.html` — page title and heading say
  "Parlour Services," not "Features & Wallpapers."

## M38 — Admin Login Renamed to "Owner Login"
**Status: ✅**
All user-visible text renamed from "Admin Login" to "Owner Login"
(sidebar button, modal title). No backend/URL/function names changed —
this is a labeling change only, so nothing else breaks.

- **Files:** `frontend/js/sidebar.js`.
- **Verify:** sidebar footer button now reads "Owner Login"; the dual-
  OTP modal title reads "Owner Login" too.

## M39 — Fixed: No Logout Option After User Login
**Status: ✅**
This was a real bug — once a customer saved their name/phone via
Login/Profile, there was genuinely no way to log out. Added a Logout
action in the sidebar's Account section (only visible once a user is
logged in) and on the new Profile page (M40). Logging out clears the
local profile and immediately restores both login options.

- **Files:** `frontend/js/sidebar.js`, `frontend/profile.html`.
- **Verify:** log in via Profile, open the sidebar — a "Logout" button
  should now appear in the Account section; clicking it signs out and
  brings back the Login option.

## M40 — Full Editable Profile Page
**Status: ✅**
Clicking "Login/Profile" (sidebar) or "Login" (navbar) now opens a
dedicated page — `profile.html` — instead of a small popup. First-time
visitors see a create-profile form (name, phone required; email, age,
DOB optional). Returning visitors see their saved details with an Edit
button that makes every field editable in place, plus a profile-photo
upload (click the avatar). This is a browser-local identity
(localStorage) — it is intentionally separate from Owner Login and
grants no access to Inventory Management.

- **Files:** `frontend/profile.html` (new), `frontend/js/sidebar.js`.
- **Verify:** sidebar → Login/Profile → fill in the create form → save
  → lands on a profile view with your details → Edit → change something
  → Save → confirms the change stuck on reload.

## M41 — User Login and Owner Login Now Mutually Exclusive, For Real
**Status: ✅ (relies on a real server session check, not a guess)**
Every page now asks the backend (`GET /api/auth/me`, using the same
httpOnly cookie Owner Login already sets) whether an owner session is
currently active, since client-side JS can't read that cookie directly.
Based on the real answer:
- Neither logged in → both "Login" (navbar) and "Owner Login" (sidebar)
  show, as before.
- A customer is logged in → navbar shows their name, sidebar Account
  section shows the Logout button (M39), and the "Owner Login" button
  is hidden.
- The owner is logged in → the navbar "Login" button hides entirely,
  and the sidebar's Account section swaps to an Owner view (see M42)
  with an Owner Logout option.
- Logging out of either restores the starting state everywhere.

- **Files:** `frontend/js/sidebar.js`.
- **Verify:** with nothing logged in, both options are visible. Log in
  as a customer — Owner Login disappears. Log out, then log in as
  Owner (dual OTP) — the navbar Login button disappears and the sidebar
  shows the Owner panel instead of the customer one.

## M42 — Owner Sidebar: Shortcuts Into the Real Admin CMS
**Status: ✅ (see note below on what this is *not*)**
When the owner is logged in, the sidebar's Account section replaces the
customer options with direct links into the **existing, unmodified**
admin system: Dashboard, Manage Products, Manage Categories, Inventory
Management, Manage Owners, plus an Owner Logout button.

**Important — what I did *not* build:** you asked for the live public
pages themselves (the homepage hero text, collection tiles, category
cards, etc.) to become directly, inline-editable the moment the owner
logs in — no separate admin area at all. That's a genuinely large
feature (an in-place WYSIWYG editing layer across every page and every
piece of content, plus a backend that can persist arbitrary edits to
things that aren't already products/categories — hero copy, section
headings, static page text) and isn't something I could responsibly
build as a quick pass alongside everything else in this message. Since
the project already has a real, working content-management system
(the Inventory Management panel), I linked the owner's sidebar into
that rather than leaving "manage the website" as a dead end.

If you still want true inline editing of the live pages, I'd like to
scope that as its own module — specifically: which parts of the public
pages need to be owner-editable in place (just product cards, which are
already covered by Inventory Management? Or also hero headlines,
section copy, images that aren't tied to a product?), so I build the
right thing rather than a shallow version of the wrong thing.

- **Files:** `frontend/js/sidebar.js`.
- **Verify:** log in as owner — sidebar Account section should show
  "Owner — Manage Website" with links to the real admin pages, not the
  customer Favorites/My Orders/booking shortcuts.

---

## M43 — User Login Upgraded to Real Accounts (Postgres, not localStorage) + Owner Login Fully Renamed
**Status: ✅**

M40's Profile page was a real, working feature but had a fundamental
limitation worth fixing properly: it was entirely localStorage-based —
"logging in" just meant typing a name into a browser form, with no
password, no server verification, and a "logout" that only cleared
local data. Anyone could claim to be anyone, and there was no real
session to invalidate.

Upgraded it to genuine accounts, kept on the **same Postgres database**
as everything else in the project (a new `User` table, right alongside
`Admin`/`Owner` — deliberately **not** a second database):

- New Prisma model `User` (name, email, passwordHash, age, dateOfBirth,
  profileImage, role, createdAt, updatedAt).
- New routes: `POST /api/user-auth/register`, `/login`, `/logout`,
  `GET /me`, `PUT /me`, `POST /me/profile-image` — bcrypt password
  hashing, JWT session in an httpOnly `user_token` cookie (kept
  completely separate from the existing `admin_token`, so the two
  systems can never collide or be confused).
- `profile.html` rebuilt: Login/Register tabs when signed out; real
  view/edit (name, age, DOB — email is intentionally read-only) and a
  real Cloudinary-backed photo upload (same pipeline/validation as
  product images, replacing the old base64-in-localStorage approach)
  when signed in; Logout now calls the real endpoint and actually
  invalidates the server-side session.
- `sidebar.js`'s role-visibility check (M41) now asks
  `GET /api/user-auth/me` for real login state instead of just checking
  whether a name was saved locally — the navbar "Login" button and
  sidebar Account panel are driven by an actual verified session.
- Security: `PUT /me` and the image upload always act on `req.user`
  (from the verified JWT) — never on an id the client sends — so User A
  can never edit User B's profile.
- Owner Login rename (M38) double-checked and finished: the last two
  leftover "Admin Login" mentions (the admin panel's own `<title>` tag
  and a help-text string in Manage Owners) are now "Owner Login" too —
  zero occurrences of "Admin Login" remain anywhere in the project.
- The existing Owner CMS-shortcuts sidebar (M42) and owner/admin
  session logic (Postgres, dual-OTP, unchanged) were **not** touched by
  any of this.

- **Files:** `backend/prisma/schema.prisma` (new `User` model),
  `backend/src/middleware/userAuth.js`, `backend/src/routes/userAuth.js`,
  `backend/src/index.js`, `frontend/profile.html`,
  `frontend/js/sidebar.js`, `frontend/admin/index.html`,
  `frontend/admin/admins.html`.
- **To go live:** run `npx prisma migrate dev` in `/backend` to add the
  `User` table to your existing Postgres database — no new database or
  connection string needed.
- **Verify:** navbar "Login" → Create Account → fill in details →
  lands on your profile, logged in for real. Refresh — still logged in
  (real session, not localStorage). Edit Details → Save → persists.
  Upload a photo → persists on refresh. Logout → redirected home,
  "Login" reappears, Owner Login reappears in the sidebar. Try Owner
  Login (dual OTP, unaffected) — navbar "Login" hides while the owner
  session is active, and the sidebar shows the Owner CMS panel (M42)
  instead of the customer one.
- **Scope boundary (per your decision):** the other 27 pages, the
  booking flow, and the catalog stay exactly as they are — vanilla
  HTML/CSS/JS, Express + Prisma + Postgres. Nothing here required or
  used MongoDB, and none was added.

---

## M44 — Favorites Fixed + Rebuilt as a Real Page
**Status: ✅**

**Bug found and fixed:** Favorites images weren't loading because of the
same relative-path inconsistency bug fixed for bookings back in M31 —
category subpages store liked images as `../assets/...` while root
pages store them as `assets/...`. The floating Favorites panel then
blindly re-added `../` on top of whatever was stored, so images liked
from a subpage got a doubled `../../assets/...` path (broken) and
images liked from a root page got a wrong path when viewed from a
subpage. Fixed at the source: `isLiked`/`setLiked` in `app.js` now
normalize every path before storing or comparing, so `utsav-likes`
always holds one consistent, correct format regardless of which page
the like happened on.

**Rebuilt as a real page** (`favorites.html`), not a floating panel —
using the exact same `.grid`/`.card-full` structure as every category
subpage (same Visit/Rent Now buttons, same sizing, same
`window.MU_hydrateCard` hydration already used everywhere else, so
there's zero visual drift). Items show in the order they were liked.
Un-hearting a card — on this page or anywhere else on the site —
removes it from this list immediately via a new `utsav-likes-updated`
event that both this page and the sidebar's favorites-count badge
listen for.

- **Files:** `frontend/js/app.js`, `frontend/favorites.html` (new),
  `frontend/js/sidebar.js`, `frontend/js/booking.js` (old floating
  panel removed).
- **Verify:** like a few items from different page types (homepage
  tile, a category subpage). Open Favorites from the sidebar — should
  land on a real page showing all of them with working images. Unlike
  one — it disappears immediately.

## M45 — Owner Registration Redesigned: Dual-OTP Bootstrap → Password → Locked Slots
**Status: ✅**

Reworked Owner Login into the two-mode flow you described:

1. **First-Time Setup** (dual OTP, phone + email) — proves identity,
   then prompts the owner to **create their own password**. The very
   first owner ever created automatically becomes the **root owner**.
2. **Log In** (returning owner) — email + contact number + password,
   no OTP. This is now the *only* way back in once setup is complete;
   attempting OTP again on an already-set-up account is rejected with
   a message pointing to this login instead.

**Owner slots**: by default only **one** owner slot exists — nobody
else can complete First-Time Setup until the root owner explicitly
raises the limit. Only the root owner can change it (`PATCH
/api/auth/owner-settings`), and doing so requires **re-entering their
own password** even though they're already logged in, as a deliberate
extra confirmation. The limit can never be set below the number of
owners who've already completed setup. Deleting an owner frees their
slot; the root owner cannot be deleted while other owners still exist
(so there's always someone who can manage the slot limit) — they can
only delete themselves once they're the last owner remaining.

- **Files:** `backend/prisma/schema.prisma` (`Admin.passwordHash` now
  nullable, `Admin.isRoot`, new `OwnerSettings` singleton model),
  `backend/src/routes/auth.js` (rewritten), `backend/src/scripts/createAdmin.js`
  (now requires phone too), `frontend/js/sidebar.js` (Owner Login modal
  rebuilt with Log In / First-Time Setup tabs + a new password-creation
  step), `frontend/admin/index.html` (added phone field),
  `frontend/admin/admins.html` (renamed to "Manage Owners"; added the
  slot-limit panel and setup-status column), all other admin pages
  (nav label rename).
- **To go live:** run `npx prisma migrate dev` in `/backend` for the
  schema changes.
- **Verify:** Owner Login → First-Time Setup → complete OTP (codes log
  to console without SMTP/SMS configured) → should prompt for a
  password → after setting it, lands on the dashboard, and this account
  is now root. Try First-Time Setup again with different details — you
  should get "no owner slots available." Go to Manage Owners → increase
  the slot limit (with your password) → now a second owner can complete
  First-Time Setup. Log out, log back in via "Log In" with email +
  phone + password — works without OTP. Try deleting the root owner
  while the second owner still exists — should be refused.
- **Known gap:** the "each site's edit option and add/remove card
  button, shown only when an owner is logged in" part of your message
  is a much larger feature (in-place editing of arbitrary text/cards on
  every live page) that goes beyond what exists today. Today, that
  capability already exists in a different, owner-only surface — the
  Inventory Management panel (add/edit/delete products, categories,
  images) — which is already gated behind Owner Login (M42) and
  untouched by this change. If you want inline "edit this card directly
  on the page" buttons instead of/in addition to the Inventory
  Management panel, that's a genuinely large, separate feature I'd want
  to scope with you specifically before starting, the same way we
  scoped the MERN migration.

---

## M46 — Mobile/Tablet-Only Fixes: Icon Sizing, Collections Layout, Modal CTA, Hero Reel
**Status: ✅ (all wrapped in max-width media queries — desktop/PC view untouched)**

Real bug reported from an actual Android device (Realme 7): the desktop
card designs were being squeezed onto phone screens with no
mobile-specific sizing, making favorite/share icons and Collections
tile text illegible, and cutting off booking buttons in the product
modal. Fixed, scoped strictly to mobile (≤900px) and a smaller-phone
refinement (≤480px):

1. **Favorite/share icon buttons** — shrunk site-wide on every card
   (Collections tiles, category cards, homepage/spotlight cards) and in
   the product detail modal. Was 32px on every screen size; now 22px on
   tablet/mobile, 20px on small phones.
2. **Collections section** — the desktop layout (three fixed-pixel-width
   rows: 400px/300px/320px cards) has no room on a phone screen; forcing
   3–4 of those cards to flex-shrink into one row squeezed each down to
   roughly 90px wide, making every label unreadable. Replaced with a
   plain, comfortable 2-per-row wrapping grid on mobile/tablet (each
   card ~47% width, taller aspect ratio) — matches your "two per row,
   all 13 categories" description exactly.
3. **Product detail modal** — Rent Now/Book Appointment now appears
   right after the star rating, *before* price and description (via
   flexbox `order`, no HTML changes), so it's visible without having to
   scroll past a long description on a short phone screen.
4. **Hero reel** — was a fixed 360px width that could exceed the actual
   available space on some phone widths, causing it to touch the right
   edge. Now responsive (`calc(100% - 32px)`, capped at 360px), with
   even margin on both sides at every mobile width.

- **Files:** `frontend/css/enhance.css` only (new section appended at
  the end, clearly marked, every rule inside a `max-width` media query).
- **Scope discipline:** nothing else was changed — no HTML, no desktop
  CSS rules, no category-page card *arrangement* (you said that part
  was already good). Every rule added here only takes effect at ≤900px
  viewport width; PC/laptop view renders exactly as before.
- **Verify on an actual phone (or DevTools device toolbar at ~375–412px
  width):** Collections section shows two comfortably-sized cards per
  row with small, legible icons/text for all 13 categories. Any category
  page's favorite/heart and share icons are small, not overlapping card
  text. Tap a product's "Visit" to open its detail view — Rent Now/Book
  Appointment is visible near the top, above the price. Homepage hero
  reel has visible breathing room on both left and right edges.

---

## How to use this going forward

Tell me a module number (or a few) and I'll either:
- walk you through testing it, or
- keep building/fixing just that module without touching the others.

That way changes stay scoped and it's obvious what's verified vs. still
open, instead of one giant "did everything change" question.
