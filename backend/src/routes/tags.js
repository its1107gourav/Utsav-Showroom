const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/tags — public (useful for filter UIs)
router.get('/', async (req, res) => {
  const tags = await prisma.tag.findMany({ orderBy: { label: 'asc' } });
  res.json({ tags });
});

router.post('/', requireAdmin, async (req, res) => {
  const { label } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label is required.' });
  try {
    const tag = await prisma.tag.create({ data: { label } });
    res.status(201).json({ tag });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'That tag already exists.' });
    res.status(500).json({ error: 'Failed to create tag.' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.tag.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tag not found.' });
    res.status(500).json({ error: 'Failed to delete tag.' });
  }
});

module.exports = router;
