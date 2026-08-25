/* =====================================================================
   UTSAV SHOWROOM — APP.JS
   =====================================================================
   Loaded on EVERY page. Six jobs:

     1. THEME TOGGLE     — Day/Night, persisted in localStorage.
     2. SCROLL REVEAL      — fade/slide-in for .reveal elements.
     3. HERO COUNTER        — animates the homepage "855" stat.
     4. CARD DATA ENGINE     — the important one. Any element with
                                class="card" and a data-image + a
                                data-category attribute gets a NAME,
                                PRICE, RATING, and REVIEW COUNT computed
                                automatically (deriveItem, below), so we
                                don't have to hand-write those for all
                                855 images. The same image always
                                produces the same name/price/rating,
                                everywhere it appears on the site
                                (homepage tile, spotlight row, or its
                                full category page) — it's a hash of
                                the file path, not random-per-load.
     5. LIKE + SHARE          — every card gets a heart (like, saved to
                                localStorage) and a share icon (copies
                                a shareable line to the clipboard, or
                                uses the native share sheet on mobile).
     6. FULL-SCREEN MODAL       — clicking a card's photo opens
                                #detailModal with the full name, price,
                                rating, description, like, share, and
                                the Rent Now / Book Appointment button.
                                Every page that uses cards includes one
                                copy of the #detailModal markup right
                                before </body> — this file is what
                                actually drives it.

   TWO CARD LAYOUTS THIS SCRIPT SUPPORTS
     .card-full     → used on the 14 category pages. Has a visible
                       .card-body already in the HTML (name/rating/
                       price/button placeholders) — this script fills
                       those placeholders in.
     .card-compact  → used for homepage/collections bento tiles,
                       spotlight rows, and studio/beauty highlight
                       cards. No .card-body — this script overlays a
                       small rating+price badge directly on the photo
                       instead, to keep those tiles compact.
   ===================================================================== */


/* ---------------------------------------------------------------------
   CARD DATA ENGINE
   -----------------------------------------------------------------
   deriveItem(imagePath, categorySlug) turns a file path like
   "assets/BRIDAL_WEAR/bb14.jpg" into a stable {name, price, rating,
   reviews, type, label, desc} object. "Stable" = a simple string hash
   of the path picks the same name/adjective/price every time, so the
   same image never shows different info in two places.
--------------------------------------------------------------------- */
const CATEGORY_META = {
  'bridal-wear':      { label:'Bridal Wear',            type:'rent',        min:1800,  max:3900,  nouns:['Lehenga Set','Bridal Gown','Saree Drape','Anarkali Set','Sharara Set'] },
  'groom-wear':       { label:'Groom Wear',              type:'rent',        min:1500,  max:3500,  nouns:['Sherwani Set','Jodhpuri Suit','Achkan Set','Bandhgala Suit'] },
  'groom-jewellery':  { label:'Groom Jewellery',          type:'rent',        min:700,   max:2000,  nouns:['Kalgi & Mala Set','Groom Necklace Set','Brooch & Chain Set','Rudraksha Mala'] },
  'pagdi-safa':       { label:'Pagdi & Safa',              type:'rent',        min:400,   max:1300,  nouns:['Pagdi','Safa','Turban Set','Royal Pagdi'] },
  'bridal-jewellery': { label:'Bridal Jewellery',           type:'rent',        min:900,   max:2600,  nouns:['Necklace Set','Choker Set','Jhumka Set','Kundan Set','Bridal Haar Set'] },
  'hair-styling':     { label:'Hair Styling',                type:'appointment', min:1200,  max:4500,  nouns:['Bridal Hairstyle','Party Hair Updo','Sleek Hair Styling','Signature Blowout'] },
  'couple-sets':      { label:'Couple Sets',                  type:'rent',        min:2000,  max:3950,  nouns:['Couple Ensemble','Matching Outfit Set','His & Her Set','Coordinated Reception Set'] },
  'juti-footwear':    { label:'Juti & Footwear',               type:'rent',        min:300,   max:900,   nouns:['Embroidered Juti','Mojari Pair','Wedding Juti','Zari Work Juti'] },
  'nail-art':         { label:'Nail Art',                       type:'appointment', min:600,   max:2200,  nouns:['Nail Art Design','3D Nail Art','Glitter Nail Look','Chrome Nail Set'] },
  'makeup-looks':     { label:'Makeup Looks',                    type:'appointment', min:2500,  max:9500,  nouns:['Bridal Makeup Look','HD Party Makeup','Signature Makeup Look','Airbrush Makeup Look'] },
  'features':         { label:'Features & Wallpapers',            type:'rent',        min:500,   max:1500,  nouns:['Studio Feature','Showcase Look','Signature Feature'] },
  'nail-care':        { label:'Nail Care',                          type:'appointment', min:400,   max:1200,  nouns:['Manicure Result','Gel Nail Finish','Nail Care Session'] },
  'face-care':        { label:'Face Care',                          type:'appointment', min:900,   max:2800,  nouns:['Facial Treatment Look','Skin Glow Session','Face Care Result'] },
  'studio-details':   { label:'Studio Details',                     type:'rent',        min:500,   max:1500,  nouns:['Studio Highlight'] },
};
const ADJ_POOL = ["Radiant","Elegant","Golden","Royal","Classic","Glossy","Sleek","Vibrant","Dreamy","Graceful","Bold","Delicate","Shimmering","Soft","Chic","Timeless","Dazzling","Fresh","Glam","Polished"];
const FIRST_POOL = ["Ishaani","Meherangiz","Arjun","Kabir","Riya","Ananya","Zara","Vivaan","Aditya","Kavya","Diya","Rudra","Meera","Reyansh","Sanaya","Veer"];

function hashPath(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
  return h;
}

function deriveItem(imagePath, catSlug) {
  const meta = CATEGORY_META[catSlug] || { label: catSlug, type: 'rent', min: 1000, max: 3000, nouns: ['Look'] };
  const h = hashPath(imagePath);
  const adj = ADJ_POOL[h % ADJ_POOL.length];
  const noun = meta.nouns[Math.floor(h / 7) % meta.nouns.length];
  const first = FIRST_POOL[Math.floor(h / 13) % FIRST_POOL.length];
  const name = `${first} ${adj} ${noun}`;
  const span = meta.max - meta.min;
  const price = meta.min + Math.round(((h % 97) / 97) * span / 50) * 50;
  const rating = (4.3 + (h % 8) / 10).toFixed(1);
  const reviews = 4 + (h % 40);
  const desc = meta.type === 'rent'
    ? `${name} from our ${meta.label} collection — available to rent with a complimentary trial fitting before your event.`
    : `${name}, one of our ${meta.label} looks — booked as an in-studio appointment with our resident artists.`;
  return { name, price, rating, reviews, type: meta.type, label: meta.label, desc };
}


/* ---------------------------------------------------------------------
   LIKES (localStorage)
   ---------------------------------------------------------------------
   Category subpages reference images as "../assets/..." while root
   pages (homepage/collections) use "assets/...". Both point at the
   same product, so every like is normalized to the root-relative form
   before it's stored or compared — otherwise the same item liked from
   two different pages is treated as two different favorites, and
   worse, images fail to load in the Favorites page because a leading
   "../" ends up pointing outside the frontend folder entirely.
--------------------------------------------------------------------- */
function normalizeImagePath(p) { return String(p || '').replace(/^(\.\.\/)+/, ''); }
function getLikes() {
  try { return JSON.parse(localStorage.getItem('utsav-likes') || '[]'); }
  catch (e) { return []; }
}
function isLiked(imagePath) { return getLikes().includes(normalizeImagePath(imagePath)); }
function setLiked(imagePath, liked) {
  const norm = normalizeImagePath(imagePath);
  let likes = getLikes();
  const idx = likes.indexOf(norm);
  if (liked && idx === -1) likes.push(norm);
  if (!liked && idx !== -1) likes.splice(idx, 1);
  localStorage.setItem('utsav-likes', JSON.stringify(likes));
  document.dispatchEvent(new CustomEvent('utsav-likes-updated'));
}


/* ---------------------------------------------------------------------
   SHARE TOAST
--------------------------------------------------------------------- */
function showToast(msg) {
  let toast = document.querySelector('.share-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'share-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(window._utsavToastTimer);
  window._utsavToastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast('Link copied — share it anywhere.'),
      () => legacyCopy(text)
    );
  } else {
    legacyCopy(text);
  }
}
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showToast('Link copied — share it anywhere.'); }
  catch (e) { showToast('Could not copy automatically — select and copy manually.'); }
  document.body.removeChild(ta);
}
function shareData(name, label, imagePath) {
  const url = location.origin + location.pathname + '#' + encodeURIComponent(imagePath);
  const text = `${name} — Utsav Showroom (${label})`;
  if (navigator.share) {
    navigator.share({ title: name, text, url }).catch(() => {});
  } else {
    copyToClipboard(`${text}\n${url}`);
  }
}


document.addEventListener('DOMContentLoaded', () => {

  /* ---------- 1. THEME TOGGLE ---------- */
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  const label = document.getElementById('toggleLabel');
  const saved = localStorage.getItem('utsav-theme') || 'day';
  root.setAttribute('data-theme', saved);
  if (label) label.textContent = saved === 'day' ? 'Day' : 'Night';
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'day' ? 'night' : 'day';
      root.setAttribute('data-theme', next);
      localStorage.setItem('utsav-theme', next);
      if (label) label.textContent = next === 'day' ? 'Day' : 'Night';
    });
  }

  /* ---------- 2. SCROLL REVEAL ---------- */
  // threshold: 0 = fire as soon as even one pixel is visible. A higher
  // threshold (e.g. 0.12) requires that FRACTION of the element's total
  // height to be on-screen at once — fine for a short hero, but a
  // category grid holding 100+ cards can be several thousand pixels
  // tall, so a percentage-based threshold could need more visible
  // height than any screen has, leaving it permanently invisible.
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } });
  }, { threshold: 0, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach((el) => revealIO.observe(el));

  /* ---------- 3. HERO COUNTER ---------- */
  const counter = document.querySelector('[data-count]');
  if (counter) {
    let counted = false;
    const countIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !counted) {
          counted = true;
          const target = parseInt(counter.getAttribute('data-count'), 10);
          const start = performance.now(); const dur = 1400;
          function tick(now) {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            counter.textContent = Math.round(eased * target);
            if (p < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.4 });
    countIO.observe(counter);
  }

  /* ---------- 4. HYDRATE EVERY CARD ----------
     Extracted into hydrateCard() (unchanged logic) so cards injected later
     by js/api-integration.js (admin-created posts, fetched from the
     backend) get exactly the same rendering as the original static cards.
     window.MU_hydrateCard is the only new surface added here. */
  function hydrateCard(card) {
    // Cards from the live API arrive with dataset already filled in
    // (name/price/rating/etc set by api-integration.js) — reuse those
    // instead of re-deriving from the image path.
    const item = card.dataset.name ? {
      name: card.dataset.name, price: card.dataset.price, rating: card.dataset.rating,
      reviews: card.dataset.reviews, type: card.dataset.type, label: card.dataset.catlabel,
      desc: card.dataset.desc,
    } : deriveItem(card.dataset.image, card.dataset.category);

    card.dataset.name = item.name;
    card.dataset.price = item.price;
    card.dataset.rating = item.rating;
    card.dataset.reviews = item.reviews;
    card.dataset.type = item.type;
    card.dataset.catlabel = item.label;
    card.dataset.desc = item.desc;

    const photo = card.querySelector('.card-photo') || card;

    // like + share icons, added to every card's photo
    const iconRow = document.createElement('div');
    iconRow.className = 'card-icon-row';
    const liked = isLiked(card.dataset.image);
    iconRow.innerHTML =
      `<button type="button" class="icon-btn like${liked ? ' liked' : ''}" aria-label="Like">${liked ? '♥' : '♡'}</button>` +
      `<button type="button" class="icon-btn share" aria-label="Share">⤴</button>`;
    photo.appendChild(iconRow);

    if (card.classList.contains('card-full')) {
      // full card (category pages): fill the visible name/rating/price/button
      const nameEl = card.querySelector('.card-name');
      const ratingEl = card.querySelector('.card-rating-val');
      const reviewsEl = card.querySelector('.card-reviews-val');
      const priceEl = card.querySelector('.card-price-val');
      const unitEl = card.querySelector('.card-price-unit');
      const ctaEl = card.querySelector('.card-cta');
      if (nameEl) nameEl.textContent = item.name;
      if (ratingEl) ratingEl.textContent = '★ ' + item.rating;
      if (reviewsEl) reviewsEl.textContent = '(' + item.reviews + ')';
      if (priceEl) priceEl.textContent = '₹' + Number(item.price).toLocaleString('en-IN');
      if (unitEl) unitEl.textContent = item.type === 'rent' ? '/ day' : '/ session';
      if (ctaEl) ctaEl.textContent = item.type === 'rent' ? 'Rent Now' : 'Book Appointment';

      // availability badge — deterministic per item so it's stable across
      // reloads, not random noise. ~85% of stock reads as available.
      const metaRow = card.querySelector('.card-meta');
      if (metaRow && !metaRow.querySelector('.card-avail')) {
        const h = hashPath(card.dataset.image);
        const low = h % 100 >= 85;
        const avail = document.createElement('div');
        avail.className = 'card-avail' + (low ? ' low' : '');
        avail.innerHTML = `<span class="dot"></span>${low ? 'Only 1 left' : 'Available'}`;
        metaRow.after(avail);
      }
    } else {
      // compact card: bare spot-cards get a small rating+price badge.
      // tiles/beauty-cards already show name+count text in their own
      // bottom overlay (.tile-overlay / .ov) — skip the badge there so
      // the two don't stack on top of each other in a small box.
      const hasOwnOverlay = card.querySelector('.tile-overlay, .ov');
      if (!hasOwnOverlay) {
        const badge = document.createElement('div');
        badge.className = 'card-badge-row';
        badge.innerHTML = `<span class="b-rating">★ ${item.rating}</span><span class="b-price">₹${Number(item.price).toLocaleString('en-IN')}</span>`;
        photo.appendChild(badge);
      }
    }
  }

  document.querySelectorAll('.card[data-image]').forEach(hydrateCard);
  // Exposed so api-integration.js can hydrate cards it injects after this
  // point (e.g. once the fetch of admin-created posts resolves).
  window.MU_hydrateCard = hydrateCard;

  /* ---------- 5 & 6. LIKE / SHARE / MODAL — one delegated click handler ---------- */
  const modal = document.getElementById('detailModal');
  const mPhoto = modal ? modal.querySelector('.modal-photo img') : null;
  const mEyebrow = modal ? modal.querySelector('.modal-eyebrow') : null;
  const mName = modal ? modal.querySelector('.modal-name') : null;
  const mRating = modal ? modal.querySelector('.modal-rating') : null;
  const mPrice = modal ? modal.querySelector('.modal-price') : null;
  const mDesc = modal ? modal.querySelector('.modal-desc') : null;
  const mCta = modal ? modal.querySelector('.modal-cta') : null;
  const mLike = modal ? modal.querySelector('.modal-like') : null;
  const mClose = modal ? modal.querySelector('.modal-close') : null;

  function openModal(card) {
    if (!modal) return;
    const d = card.dataset;
    modal.dataset.image = d.image;
    modal.dataset.name = d.name;
    modal.dataset.catlabel = d.catlabel;
    modal.dataset.price = d.price;
    modal.dataset.type = d.type;
    mPhoto.src = d.image; mPhoto.alt = d.name;
    mEyebrow.textContent = d.catlabel + ' — ' + (d.type === 'rent' ? 'Rental Piece' : 'Studio Service');
    mName.textContent = d.name;
    mRating.innerHTML = '★ ' + d.rating + ' <span style="opacity:.6">(' + d.reviews + ' reviews)</span>';
    mPrice.innerHTML = '₹' + Number(d.price).toLocaleString('en-IN') + '<small>' + (d.type === 'rent' ? ' / rental' : ' / session') + '</small>';
    mDesc.textContent = d.desc;
    mCta.textContent = d.type === 'rent' ? 'Rent Now →' : 'Book Appointment →';
    const liked = isLiked(d.image);
    mLike.classList.toggle('liked', liked);
    mLike.textContent = liked ? '♥' : '♡';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
  if (mClose) mClose.addEventListener('click', closeModal);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  document.addEventListener('click', (e) => {
    // --- LIKE (card icon or modal button) ---
    const likeBtn = e.target.closest('.icon-btn.like, .modal-like');
    if (likeBtn) {
      e.stopPropagation();
      const isModalLike = likeBtn.classList.contains('modal-like');
      const imagePath = isModalLike ? modal.dataset.image : likeBtn.closest('[data-image]').dataset.image;
      const nowLiked = !isLiked(imagePath);
      setLiked(imagePath, nowLiked);
      likeBtn.classList.toggle('liked', nowLiked);
      likeBtn.textContent = nowLiked ? '♥' : '♡';
      // keep modal + its source card in sync if both are showing the same image
      if (!isModalLike && modal && modal.dataset.image === imagePath) {
        mLike.classList.toggle('liked', nowLiked);
        mLike.textContent = nowLiked ? '♥' : '♡';
      }
      return;
    }

    // --- SHARE (card icon or modal button) ---
    const shareBtn = e.target.closest('.icon-btn.share, .modal-share');
    if (shareBtn) {
      e.stopPropagation();
      const isModalShare = shareBtn.classList.contains('modal-share');
      const source = isModalShare ? modal : shareBtn.closest('[data-image]');
      shareData(source.dataset.name, source.dataset.catlabel, source.dataset.image);
      return;
    }

    // --- VISIT (full-detail view) — same modal used everywhere else ---
    const visitBtn = e.target.closest('.btn-visit');
    if (visitBtn) {
      e.stopPropagation();
      const card = visitBtn.closest('[data-image]');
      if (card) openModal(card);
      return;
    }

    // --- RENT NOW / BOOK APPOINTMENT (card button or modal button) ---
    // Opens the floating rental booking window (booking.js), never WhatsApp.
    const ctaBtn = e.target.closest('.card-cta, .modal-cta');
    if (ctaBtn) {
      e.stopPropagation();
      const isModalCta = ctaBtn.classList.contains('modal-cta');
      const source = isModalCta ? modal : ctaBtn.closest('[data-image]');
      const d = source.dataset;
      if (typeof window.MU_openBooking === 'function') {
        window.MU_openBooking({ image: d.image, name: d.name, price: d.price, type: d.type, category: d.category || d.catlabel });
        if (isModalCta) closeModal();
      } else {
        showToast('Booking is starting up — please try again in a moment.');
      }
      return;
    }

    // --- explicit "View Collection" links inside compact tiles: let them navigate ---
    if (e.target.closest('a.tile-link')) return;

    // --- collection tiles (.bento .tile): clicking ANYWHERE on the tile
    // (not just "View Collection") pushes straight to that category page,
    // instead of opening the quick-preview modal. ---
    const tile = e.target.closest('.tile[data-image]');
    if (tile) {
      const link = tile.querySelector('a.tile-link');
      if (link && link.getAttribute('href')) { window.location.href = link.getAttribute('href'); return; }
    }

    // --- otherwise, clicking a card opens the modal (this IS "Visit" for compact cards) ---
    const card = e.target.closest('.card[data-image]');
    if (card) openModal(card);
  });

});