const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.use(requireAdmin);

// POST /api/posts/:postId/sections
router.post('/posts/:postId/sections', async (req, res) => {
  const { title, content, sortOrder, visible } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required.' });
  const section = await prisma.section.create({
    data: { postId: req.params.postId, title, content, sortOrder: sortOrder || 0, visible: visible !== false },
  });
  res.status(201).json({ section });
});

// PUT /api/sections/:id
router.put('/sections/:id', async (req, res) => {
  try {
    const section = await prisma.section.update({ where: { id: req.params.id }, data: req.body || {} });
    res.json({ section });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Section not found.' });
    res.status(500).json({ error: 'Failed to update section.' });
  }
});

// DELETE /api/sections/:id
router.delete('/sections/:id', async (req, res) => {
  try {
    await prisma.section.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Section not found.' });
    res.status(500).json({ error: 'Failed to delete section.' });
  }
});

// PATCH /api/sections/reorder  { order: [id, id, id] }
router.patch('/sections/reorder', async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of section ids.' });
  await prisma.$transaction(order.map((id, i) => prisma.section.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

// ---- Subsections ----
// POST /api/sections/:sectionId/subsections
router.post('/sections/:sectionId/subsections', async (req, res) => {
  const { title, content, sortOrder, visible } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required.' });
  const subsection = await prisma.subsection.create({
    data: { sectionId: req.params.sectionId, title, content, sortOrder: sortOrder || 0, visible: visible !== false },
  });
  res.status(201).json({ subsection });
});

router.put('/subsections/:id', async (req, res) => {
  try {
    const subsection = await prisma.subsection.update({ where: { id: req.params.id }, data: req.body || {} });
    res.json({ subsection });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Subsection not found.' });
    res.status(500).json({ error: 'Failed to update subsection.' });
  }
});

router.delete('/subsections/:id', async (req, res) => {
  try {
    await prisma.subsection.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Subsection not found.' });
    res.status(500).json({ error: 'Failed to delete subsection.' });
  }
});

router.patch('/subsections/reorder', async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of subsection ids.' });
  await prisma.$transaction(order.map((id, i) => prisma.subsection.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

module.exports = router;
