const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const PUBLIC_INCLUDE = {
  category: true,
  subcategory: true,
  coverImage: true,
  images: { orderBy: { sortOrder: 'asc' } },
  sections: {
    orderBy: { sortOrder: 'asc' },
    include: { subsections: { orderBy: { sortOrder: 'asc' } } },
  },
  features: { orderBy: { sortOrder: 'asc' } },
  tags: true,
};

const ADMIN_INCLUDE = { ...PUBLIC_INCLUDE, inventory: true };

// Only visible/published sections & subsections go to the public frontend.
function stripHidden(post) {
  if (!post) return post;
  return {
    ...post,
    sections: (post.sections || [])
      .filter((s) => s.visible)
      .map((s) => ({ ...s, subsections: (s.subsections || []).filter((sub) => sub.visible) })),
  };
}

// GET /api/posts — public: published only. Admin (?all=1, authenticated): everything.
router.get('/', async (req, res) => {
  const { category, subcategory, type, all } = req.query;
  const wantsAll = all === '1' || all === 'true';

  let isAdmin = false;
  if (wantsAll) {
    // lightweight inline check so this single route can serve both public & admin lists
    const jwt = require('jsonwebtoken');
    const token = (req.cookies && req.cookies.admin_token) ||
      ((req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    if (token) {
      try { jwt.verify(token, process.env.JWT_SECRET); isAdmin = true; } catch (e) { isAdmin = false; }
    }
  }

  const where = {};
  if (!isAdmin) where.status = 'PUBLISHED';
  if (category) where.category = { slug: category };
  if (subcategory) where.subcategory = { slug: subcategory };
  if (type) where.type = type.toUpperCase();

  const posts = await prisma.post.findMany({
    where,
    include: isAdmin ? ADMIN_INCLUDE : PUBLIC_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  res.json({ posts: isAdmin ? posts : posts.map(stripHidden) });
});

// GET /api/posts/:slug — public if published, admin can preview drafts via header/cookie
router.get('/:slug', async (req, res) => {
  const post = await prisma.post.findUnique({
    where: { slug: req.params.slug },
    include: ADMIN_INCLUDE,
  });
  if (!post) return res.status(404).json({ error: 'Not found.' });

  if (post.status !== 'PUBLISHED') {
    const jwt = require('jsonwebtoken');
    const token = (req.cookies && req.cookies.admin_token) ||
      ((req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    let isAdmin = false;
    if (token) { try { jwt.verify(token, process.env.JWT_SECRET); isAdmin = true; } catch (e) {} }
    if (!isAdmin) return res.status(404).json({ error: 'Not found.' });
    return res.json({ post });
  }

  res.json({ post: stripHidden(post) });
});

// ---- Everything below requires an authenticated admin ----
router.use(requireAdmin);

// GET /api/posts/id/:id — admin lookup by database id (used by the post editor)
router.get('/id/:id', async (req, res) => {
  const post = await prisma.post.findUnique({ where: { id: req.params.id }, include: ADMIN_INCLUDE });
  if (!post) return res.status(404).json({ error: 'Not found.' });
  res.json({ post });
});

// POST /api/posts — create
router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.slug) return res.status(400).json({ error: 'title and slug are required.' });

  try {
    const post = await prisma.post.create({
      data: {
        title: b.title,
        slug: b.slug,
        type: b.type || 'PRODUCT',
        status: b.status || 'DRAFT',
        featured: !!b.featured,
        shortDescription: b.shortDescription || null,
        fullDescription: b.fullDescription || null,
        categoryId: b.categoryId || null,
        subcategoryId: b.subcategoryId || null,
        price: b.price != null ? Number(b.price) : null,
        unit: b.unit || null,
        sku: b.sku || null,
        materials: b.materials || null,
        size: b.size || null,
        dimensions: b.dimensions || null,
        availability: b.availability || null,
        brand: b.brand || null,
        publishedAt: b.status === 'PUBLISHED' ? new Date() : null,
        tags: b.tagLabels && b.tagLabels.length
          ? { connectOrCreate: b.tagLabels.map((label) => ({ where: { label }, create: { label } })) }
          : undefined,
      },
      include: ADMIN_INCLUDE,
    });
    res.status(201).json({ post });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: `A post with that ${err.meta?.target?.[0] || 'field'} already exists.` });
    console.error(err);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

// PUT /api/posts/:id — update core fields
router.put('/:id', async (req, res) => {
  const b = req.body || {};
  const data = {};
  const fields = ['title', 'slug', 'type', 'status', 'featured', 'shortDescription', 'fullDescription',
    'categoryId', 'subcategoryId', 'unit', 'sku', 'materials', 'size', 'dimensions', 'availability', 'brand'];
  fields.forEach((f) => { if (b[f] !== undefined) data[f] = b[f]; });
  if (b.price !== undefined) data.price = b.price === null ? null : Number(b.price);
  if (b.coverImageId !== undefined) data.coverImageId = b.coverImageId;

  if (b.status === 'PUBLISHED') {
    const existing = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (existing && existing.status !== 'PUBLISHED') data.publishedAt = new Date();
  }

  if (b.tagLabels) {
    data.tags = { set: [], connectOrCreate: b.tagLabels.map((label) => ({ where: { label }, create: { label } })) };
  }

  try {
    const post = await prisma.post.update({ where: { id: req.params.id }, data, include: ADMIN_INCLUDE });
    res.json({ post });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Post not found.' });
    if (err.code === 'P2002') return res.status(409).json({ error: `A post with that ${err.meta?.target?.[0] || 'field'} already exists.` });
    console.error(err);
    res.status(500).json({ error: 'Failed to update post.' });
  }
});

// PATCH /api/posts/:id/status — publish / unpublish / archive
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
    return res.status(400).json({ error: 'status must be DRAFT, PUBLISHED, or ARCHIVED.' });
  }
  const existing = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Post not found.' });

  const post = await prisma.post.update({
    where: { id: req.params.id },
    data: { status, publishedAt: status === 'PUBLISHED' && !existing.publishedAt ? new Date() : existing.publishedAt },
  });
  res.json({ post });
});

// DELETE /api/posts/:id — hard delete (use status=ARCHIVED for soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await prisma.post.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Post not found.' });
    console.error(err);
    res.status(500).json({ error: 'Failed to delete post.' });
  }
});

module.exports = router;
