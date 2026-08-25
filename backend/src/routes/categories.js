const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/categories — public
router.get('/', async (req, res) => {
  const categories = await prisma.category.findMany({
    include: { subcategories: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });
  res.json({ categories });
});

router.use(requireAdmin);

// POST /api/categories
router.post('/', async (req, res) => {
  const { key, slug, label, blurb, type, sortOrder } = req.body || {};
  if (!key || !slug || !label) return res.status(400).json({ error: 'key, slug, and label are required.' });
  try {
    const category = await prisma.category.create({ data: { key, slug, label, blurb, type, sortOrder: sortOrder || 0 } });
    res.status(201).json({ category });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A category with that key/slug already exists.' });
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

// PUT /api/categories/:id
router.put('/:id', async (req, res) => {
  try {
    const category = await prisma.category.update({ where: { id: req.params.id }, data: req.body || {} });
    res.json({ category });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Category not found.' });
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Category not found.' });
    res.status(500).json({ error: 'Failed to delete category (it may still have posts attached).' });
  }
});

// POST /api/categories/:id/subcategories
router.post('/:id/subcategories', async (req, res) => {
  const { slug, label, sortOrder } = req.body || {};
  if (!slug || !label) return res.status(400).json({ error: 'slug and label are required.' });
  try {
    const subcategory = await prisma.subcategory.create({
      data: { categoryId: req.params.id, slug, label, sortOrder: sortOrder || 0 },
    });
    res.status(201).json({ subcategory });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'That subcategory slug already exists in this category.' });
    res.status(500).json({ error: 'Failed to create subcategory.' });
  }
});

// PUT /api/subcategories/:id (mounted separately below in index.js as /api/subcategories)
router.put('/subcategories/:id', async (req, res) => {
  try {
    const subcategory = await prisma.subcategory.update({ where: { id: req.params.id }, data: req.body || {} });
    res.json({ subcategory });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Subcategory not found.' });
    res.status(500).json({ error: 'Failed to update subcategory.' });
  }
});

router.delete('/subcategories/:id', async (req, res) => {
  try {
    await prisma.subcategory.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Subcategory not found.' });
    res.status(500).json({ error: 'Failed to delete subcategory.' });
  }
});

module.exports = router;
