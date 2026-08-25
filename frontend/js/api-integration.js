/* ============================================================
   api-integration.js
   ------------------------------------------------------------
   Minimal, additive bridge between the existing static frontend
   and the new backend/CMS. It does NOT change how the existing
   855 hardcoded images render — those keep working exactly as
   before, even if the API is offline.

   What it does:
   1. On a category page (pages/<slug>.html), reads the category
      slug off an existing card's data-category attribute.
   2. Fetches published posts for that category from the backend.
   3. For posts migrated from the original catalog-data.js
      (post.legacyImagePath set), finds the matching static card
      already on the page and, if the admin has since edited that
      product, overwrites its visible title/price/description/
      image with the live database values — this is what makes
      "edit an existing post -> save -> refresh" actually show up
      on the live site for the original 855 products.
   4. For genuinely new posts the admin created from scratch in
      the CMS, builds a card using the exact same markup/classes
      as the existing cards (.card.card-full, same inner
      structure) and appends it to the same .grid the static
      cards live in, then calls window.MU_hydrateCard(card) —
      the same function app.js uses for every other card — so
      likes/share/modal/styling all work identically.
   5. If the API is unreachable, fails silently: the page is
      exactly the original static site.
   ============================================================ */
(function () {
  function getCategorySlugFromPage() {
    const sample = document.querySelector('.card[data-category]');
    if (sample) return sample.dataset.category;
    // fallback: derive from the filename, e.g. pages/pagdi-safa.html -> pagdi-safa
    const file = location.pathname.split('/').pop() || '';
    return file.replace('.html', '');
  }

  function buildCardEl(post, catSlug) {
    const image = post.coverImage ? post.coverImage.url : (post.images && post.images[0] ? post.images[0].url : '');
    if (!image) return null;

    const wrap = document.createElement('div');
    wrap.className = 'card card-full';
    wrap.dataset.image = image;
    wrap.dataset.category = catSlug;
    wrap.dataset.postId = post.id;
    wrap.dataset.name = post.title;
    wrap.dataset.price = post.price != null ? post.price : 0;
    wrap.dataset.rating = '4.8';
    wrap.dataset.reviews = '0';
    wrap.dataset.type = post.category && post.category.type === 'service' ? 'service' : 'rent';
    wrap.dataset.catlabel = post.category ? post.category.label : catSlug;
    wrap.dataset.desc = post.shortDescription || post.fullDescription || post.title;

    wrap.innerHTML = `
      <div class="card-photo"><img loading="lazy" src="${image}" alt="${post.title}"></div>
      <div class="card-body">
        <h3 class="card-name"></h3>
        <div class="card-meta"><span class="card-rating"><span class="card-rating-val"></span> <span class="card-reviews-val"></span></span></div>
        <div class="card-price"><span class="card-price-val"></span><small class="card-price-unit"></small></div>
        <button type="button" class="btn btn-solid btn-block card-cta"></button>
      </div>
    `;
    return wrap;
  }

  async function injectAdminPosts() {
    const grid = document.querySelector('.grid.card-mid, .grid.card-min, .grid.card-max, .grid');
    if (!grid) return; // not a category-style listing page

    const catSlug = getCategorySlugFromPage();
    if (!catSlug) return;

    let posts;
    try {
      const res = await fetch(`${window.MU_API_BASE}/api/posts?category=${encodeURIComponent(catSlug)}`);
      if (!res.ok) return;
      ({ posts } = await res.json());
    } catch (e) {
      return; // API offline/unreachable — original static site still works fully
    }

    // Brand-new posts the admin created from scratch: append as new cards.
    (posts || [])
      .filter((p) => !p.legacyImagePath)
      .forEach((post) => {
        const card = buildCardEl(post, catSlug);
        if (!card) return;
        grid.appendChild(card);
        if (window.MU_hydrateCard) window.MU_hydrateCard(card);
      });

    // Posts migrated from the original catalog-data.js: if the admin has
    // since edited one (title/price/description/cover image), overwrite
    // the matching static card's visible text/image with the live values.
    const legacyMap = new Map();
    (posts || []).forEach((p) => { if (p.legacyImagePath) legacyMap.set(normalizePath(p.legacyImagePath), p); });
    if (legacyMap.size) {
      grid.querySelectorAll('.card[data-image]').forEach((card) => {
        const post = legacyMap.get(normalizePath(card.dataset.image));
        if (post) applyLiveOverride(card, post);
      });
    }
  }

  // Normalizes a card's data-image ("../assets/PAGDI_SAFA/pag1.jpg") and a
  // post's legacyImagePath ("assets/PAGDI_SAFA/pag1.jpg") to the same form
  // so admin edits to a *migrated* product can be matched back to the
  // exact static card it was seeded from.
  function normalizePath(p) {
    return (p || '').replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
  }

  // Overwrites a static card's visible text (and image, if the admin
  // uploaded a new one) with the current database values — this is what
  // makes "edit an existing post -> save -> refresh -> site updates" work
  // for the original 855 migrated products, not just brand-new posts.
  // It intentionally does NOT touch the like/share icon row or re-run the
  // full hydrate pipeline, so nothing gets duplicated.
  function applyLiveOverride(card, post) {
    if (post.title) card.dataset.name = post.title;
    if (post.price != null) card.dataset.price = post.price;
    const desc = post.shortDescription || post.fullDescription;
    if (desc) card.dataset.desc = desc;

    if (post.coverImage && post.coverImage.url) {
      card.dataset.image = post.coverImage.url;
      const img = card.querySelector('.card-photo img, img');
      if (img) img.src = post.coverImage.url;
    }

    if (card.classList.contains('card-full')) {
      const nameEl = card.querySelector('.card-name');
      const priceEl = card.querySelector('.card-price-val');
      if (nameEl && post.title) nameEl.textContent = post.title;
      if (priceEl && post.price != null) priceEl.textContent = '₹' + Number(post.price).toLocaleString('en-IN');
    } else {
      const badgePrice = card.querySelector('.b-price');
      if (badgePrice && post.price != null) badgePrice.textContent = '₹' + Number(post.price).toLocaleString('en-IN');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAdminPosts);
  } else {
    injectAdminPosts();
  }
})();
