const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.use(requireAdmin);

// POST /api/posts/:postId/features
router.post('/posts/:postId/features', async (req, res) => {
  const { title, description, sortOrder } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required.' });
  const feature = await prisma.feature.create({
    data: { postId: req.params.postId, title, description, sortOrder: sortOrder || 0 },
  });
  res.status(201).json({ feature });
});

router.put('/features/:id', async (req, res) => {
  try {
    const feature = await prisma.feature.update({ where: { id: req.params.id }, data: req.body || {} });
    res.json({ feature });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Feature not found.' });
    res.status(500).json({ error: 'Failed to update feature.' });
  }
});

router.delete('/features/:id', async (req, res) => {
  try {
    await prisma.feature.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Feature not found.' });
    res.status(500).json({ error: 'Failed to delete feature.' });
  }
});

router.patch('/features/reorder', async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of feature ids.' });
  await prisma.$transaction(order.map((id, i) => prisma.feature.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

module.exports = router;
