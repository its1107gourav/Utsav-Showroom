/**
 * Migration script — imports the existing hardcoded catalog from the
 * frontend's js/catalog-data.js into the database, so the site can be
 * cut over to dynamic data without losing anything that's already there.
 *
 * Run once after your first `prisma migrate deploy`:
 *   node prisma/seed.js
 *
 * It is safe to re-run: categories/posts are upserted by their stable key/slug.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const prisma = require('../src/lib/prisma');

// Path to the frontend's catalog-data.js relative to this repo's root layout:
//   repo/
//     backend/prisma/seed.js   <- you are here
//     frontend/js/catalog-data.js
const CATALOG_DATA_PATH = path.join(__dirname, '..', '..', 'frontend', 'js', 'catalog-data.js');

function loadCatalogData() {
  const src = fs.readFileSync(CATALOG_DATA_PATH, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\n;this.CATALOG_DATA = CATALOG_DATA;', sandbox);
  if (!sandbox.CATALOG_DATA) {
    throw new Error('CATALOG_DATA was not found in catalog-data.js — check the file still defines a top-level CATALOG_DATA object.');
  }
  return sandbox.CATALOG_DATA;
}

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Same seeded-PRNG + naming logic as the frontend's catalog.js, so migrated
// prices/names match exactly what shoppers have already been seeing.
function seededRandom(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const STYLE_WORDS = ['Radiant', 'Royal', 'Elegant', 'Golden', 'Classic', 'Glossy',
  'Sleek', 'Vibrant', 'Dreamy', 'Graceful', 'Bold', 'Delicate', 'Shimmering',
  'Soft', 'Chic', 'Timeless', 'Dazzling', 'Fresh', 'Polished', 'Regal'];
const ITEM_NOUNS = {
  BRIDAL_WEAR: ['Bridal Lehenga', 'Wedding Gown', 'Bridal Saree Set', 'Sangeet Lehenga', 'Reception Gown'],
  GROOM_WEAR: ['Sherwani Set', 'Jodhpuri Suit', 'Wedding Achkan', 'Bandhgala Suit'],
  COUPLE_SETS: ['Couple Ensemble', 'Matching Outfit Set', 'His & Her Set'],
  BRIDAL_JEWELLERY: ['Bridal Necklace Set', 'Choker Set', 'Kundan Jewellery Set'],
  GROOM_JEWELLERY: ['Groom Mala Set', 'Kalgi & Brooch Set', 'Groom Accessory Set'],
  JUTI_FOOTWEAR: ['Embroidered Juti', 'Mojari Pair', 'Wedding Juti'],
  PAGDI_SAFA: ['Wedding Pagdi', 'Royal Safa', 'Turban Set'],
  HAIR_STYLING: ['Bridal Hairstyle', 'Party Hair Updo', 'Sleek Hair Styling', 'Keratin Finish'],
  MAKEUP_LOOKS: ['Bridal Makeup Look', 'HD Party Makeup', 'Signature Makeup Look'],
  NAIL_ART: ['Nail Art Design', '3D Nail Art', 'Glitter Nail Look'],
  NAIL_CARE: ['Manicure Finish', 'Nail Care Session', 'Gel Polish Look'],
  FACE_CARE: ['Facial Treatment', 'Skin Glow Session', 'Face Care Result'],
  FEATURES_WALLPAPERS: ['Studio Feature', 'Showcase Look'],
  STUDIO_DETAILS: ['Studio Highlight'],
};

function buildItem(catKey, cfg, filename, index) {
  const rand = seededRandom(index + catKey.length * 97);
  const style = STYLE_WORDS[index % STYLE_WORDS.length];
  const nounPool = ITEM_NOUNS[catKey] || ['Look'];
  const noun = nounPool[index % nounPool.length];
  const name = `${style} ${noun} ${index + 1}`;
  const [lo, hi] = cfg.priceRange;
  const price = lo === 0 ? 0 : Math.round((lo + rand() * (hi - lo)) / 50) * 50;
  return { name, price, image: `assets/${catKey}/${filename}` };
}

async function main() {
  const CATALOG_DATA = loadCatalogData();
  let categoriesCreated = 0, postsCreated = 0;
  const startedAt = Date.now();

  let catOrder = 0;
  for (const [catKey, cfg] of Object.entries(CATALOG_DATA)) {
    const category = await prisma.category.upsert({
      where: { key: catKey },
      update: { slug: cfg.slug, label: cfg.label, blurb: cfg.blurb, type: cfg.type, sortOrder: catOrder },
      create: { key: catKey, slug: cfg.slug, label: cfg.label, blurb: cfg.blurb, type: cfg.type, sortOrder: catOrder },
    });
    categoriesCreated++;
    catOrder++;
    console.log(`[${Math.round((Date.now() - startedAt) / 1000)}s] Category ${categoriesCreated}: ${cfg.label} (${cfg.files.length} items)`);

    let i = 0;
    for (const filename of cfg.files) {
      const item = buildItem(catKey, cfg, filename, i);
      const slug = `${cfg.slug}-${i + 1}-${slugify(path.parse(filename).name)}`;

      const post = await prisma.post.upsert({
        where: { slug },
        update: {}, // don't clobber admin edits on re-run
        create: {
          title: item.name,
          slug,
          type: 'PRODUCT',
          status: 'PUBLISHED',
          shortDescription: `${item.name} from our ${cfg.label} collection.`,
          categoryId: category.id,
          price: item.price,
          unit: cfg.unit || null,
          legacyImagePath: item.image,
          publishedAt: new Date(),
        },
      });

      // Give every migrated product a starting inventory record so the
      // owner sees it immediately in the Inventory tab (default: 1 unit).
      await prisma.inventoryItem.upsert({
        where: { postId: post.id },
        update: {},
        create: { postId: post.id, totalUnits: 1, lowStockThreshold: 1 },
      });

      postsCreated++;
      if (postsCreated % 25 === 0) {
      console.log(`  [${Math.round((Date.now() - startedAt) / 1000)}s] ...${postsCreated} products done so far`);
      }
      i++;
    }
  }

  console.log(`Seed complete in ${Math.round((Date.now() - startedAt) / 1000)}s: ${categoriesCreated} categories, ${postsCreated} posts (with starting inventory records).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
