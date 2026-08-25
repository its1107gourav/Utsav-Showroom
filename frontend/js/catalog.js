/* ============================================================
   catalog.js
   ------------------------------------------------------------
   WHAT THIS FILE DOES
   This file turns the raw data in catalog-data.js (just folder
   names + filenames) into real catalog items: a stylised name,
   a price, a star rating, and the right call-to-action label
   ("Rent Now" for wardrobe/jewellery, "Book Appointment" for
   beauty-studio services).

   WHY IT'S SEPARATE FROM catalog-data.js
   catalog-data.js is DATA (what images we actually own).
   catalog.js is LOGIC (how we turn that data into something a
   shopper sees: names, prices, ratings). Keeping them apart
   means you can hand catalog-data.js to someone re-shooting the
   archive without touching a single line of logic, and you can
   change pricing/naming rules here without touching the file
   list.

   WHO USES THIS FILE
   - index.html (homepage)      -> getCategoryList(), getStats()
   - category.html (subpages)   -> getCategoryBySlug(), items
   Both pull from the single buildCatalog() call at the bottom
   of this file, so every page sees identical prices/ratings/
   names for the same image, every time (see "seeded random"
   below for why it's identical on every reload).
   ============================================================ */

/* ---- 1. Deterministic "random" -----------------------------
   We want every image to get the SAME name/price/rating every
   time the site loads (not a new random value on every refresh).
   A normal Math.random() would re-roll on every page view, so
   instead we seed a tiny pseudo-random generator with the
   item's own index number. Same index in -> same "random" number
   out, forever. This is called a seeded PRNG (mulberry32 algorithm). */
function seededRandom(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- 2. Naming pools -----------------------------------------
   Two flavours of name, matched to whether the category is
   something you RENT (clothing/jewellery) or a STUDIO SERVICE
   (a look our stylists produced). Real Indian wedding-vocabulary
   words, mixed and matched per item so 855 items don't all read
   as "Item #1, Item #2...". */
const STYLE_WORDS = ["Radiant", "Royal", "Elegant", "Golden", "Classic", "Glossy",
  "Sleek", "Vibrant", "Dreamy", "Graceful", "Bold", "Delicate", "Shimmering",
  "Soft", "Chic", "Timeless", "Dazzling", "Fresh", "Polished", "Regal"];

const ITEM_NOUNS = {
  BRIDAL_WEAR: ["Bridal Lehenga", "Wedding Gown", "Bridal Saree Set", "Sangeet Lehenga", "Reception Gown"],
  GROOM_WEAR: ["Sherwani Set", "Jodhpuri Suit", "Wedding Achkan", "Bandhgala Suit"],
  COUPLE_SETS: ["Couple Ensemble", "Matching Outfit Set", "His & Her Set"],
  BRIDAL_JEWELLERY: ["Bridal Necklace Set", "Choker Set", "Kundan Jewellery Set"],
  GROOM_JEWELLERY: ["Groom Mala Set", "Kalgi & Brooch Set", "Groom Accessory Set"],
  JUTI_FOOTWEAR: ["Embroidered Juti", "Mojari Pair", "Wedding Juti"],
  PAGDI_SAFA: ["Wedding Pagdi", "Royal Safa", "Turban Set"],
  HAIR_STYLING: ["Bridal Hairstyle", "Party Hair Updo", "Sleek Hair Styling", "Keratin Finish"],
  MAKEUP_LOOKS: ["Bridal Makeup Look", "HD Party Makeup", "Signature Makeup Look"],
  NAIL_ART: ["Nail Art Design", "3D Nail Art", "Glitter Nail Look"],
  NAIL_CARE: ["Manicure Finish", "Nail Care Session", "Gel Polish Look"],
  FACE_CARE: ["Facial Treatment", "Skin Glow Session", "Face Care Result"],
  FEATURES_WALLPAPERS: ["Studio Feature", "Showcase Look"],
  STUDIO_DETAILS: ["Studio Highlight"],
};

/* ---- 3. Build one catalog item from one filename -------------
   index  = position of this file inside its category (0, 1, 2…)
   used both to pick a name/rating deterministically AND to
   avoid ever generating the exact same name twice in a row. */
function buildItem(catKey, cfg, filename, index) {
  const rand = seededRandom(index + catKey.length * 97); // seed varies by category too
  const style = STYLE_WORDS[index % STYLE_WORDS.length];
  const nounPool = ITEM_NOUNS[catKey] || ["Look"];
  const noun = nounPool[index % nounPool.length];
  const name = `${style} ${noun} ${index + 1}`;

  const [lo, hi] = cfg.priceRange;
  const price = lo === 0 ? 0 : Math.round((lo + rand() * (hi - lo)) / 50) * 50;
  const rating = (4.3 + rand() * 0.7).toFixed(1); // 4.3 - 5.0, one decimal
  const reviews = Math.floor(4 + rand() * 40);

  return {
    id: `${catKey}-${index}`,
    name,
    image: `assets/${catKey}/${filename}`,
    price,
    unit: cfg.unit,
    rating: Number(rating),
    reviews,
    category: catKey,
    categoryLabel: cfg.label,
    type: cfg.type, // 'rental' | 'service'
    ctaLabel: cfg.type === "rental" ? "Rent Now" : "Book Appointment",
  };
}

/* ---- 4. Build the full catalog once, on load ------------------ */
function buildCatalog() {
  const categories = {};
  Object.entries(CATALOG_DATA).forEach(([key, cfg]) => {
    const items = cfg.files.map((fname, i) => buildItem(key, cfg, fname, i));
    categories[key] = { key, ...cfg, items };
  });
  return categories;
}

// The single in-memory catalog every page reads from.
const CATALOG = buildCatalog();

/* ---- 5. Small public helpers used by index.html / category.html */

// All categories as an array, in the display order we want on the homepage.
function getCategoryList() {
  const order = ["BRIDAL_WEAR", "GROOM_WEAR", "GROOM_JEWELLERY", "PAGDI_SAFA",
    "BRIDAL_JEWELLERY", "HAIR_STYLING", "COUPLE_SETS", "JUTI_FOOTWEAR",
    "NAIL_ART", "MAKEUP_LOOKS", "FEATURES_WALLPAPERS", "NAIL_CARE",
    "FACE_CARE", "STUDIO_DETAILS"];
  return order.map((k) => CATALOG[k]);
}

// Look up a category by its URL slug, e.g. "hair-styling" -> HAIR_STYLING.
function getCategoryBySlug(slug) {
  return Object.values(CATALOG).find((c) => c.slug === slug) || null;
}

// Site-wide totals used for the homepage's animated "855 looks" counter.
function getStats() {
  const cats = Object.values(CATALOG);
  return {
    totalItems: cats.reduce((sum, c) => sum + c.items.length, 0),
    totalCategories: cats.length,
  };
}
