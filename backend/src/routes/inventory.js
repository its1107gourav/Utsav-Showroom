const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Everything here is owner/admin-only — stock counts and cost price are never public.
router.use(requireAdmin);

function withAvailable(item) {
  if (!item) return item;
  const available = item.totalUnits - item.reservedUnits - item.damagedUnits;
  return { ...item, availableUnits: available < 0 ? 0 : available, lowStock: available <= item.lowStockThreshold };
}

// GET /api/inventory — full stock list for the owner dashboard, with post info joined in.
// ?lowStock=1 filters to items at/under their threshold.
router.get('/', async (req, res) => {
  const items = await prisma.inventoryItem.findMany({
    include: { post: { select: { id: true, title: true, slug: true, status: true, sku: true, price: true, category: { select: { label: true } } } } },
    orderBy: { updatedAt: 'desc' },
  });
  let mapped = items.map(withAvailable);
  if (req.query.lowStock === '1') mapped = mapped.filter((i) => i.lowStock);
  res.json({ inventory: mapped });
});

// GET /api/inventory/summary — quick counts for a dashboard widget
router.get('/summary', async (req, res) => {
  const items = await prisma.inventoryItem.findMany();
  const mapped = items.map(withAvailable);
  res.json({
    totalItems: mapped.length,
    totalUnits: mapped.reduce((s, i) => s + i.totalUnits, 0),
    reservedUnits: mapped.reduce((s, i) => s + i.reservedUnits, 0),
    damagedUnits: mapped.reduce((s, i) => s + i.damagedUnits, 0),
    lowStockCount: mapped.filter((i) => i.lowStock).length,
  });
});

// GET /api/inventory/:postId — for one post
router.get('/:postId', async (req, res) => {
  const item = await prisma.inventoryItem.findUnique({ where: { postId: req.params.postId } });
  if (!item) return res.status(404).json({ error: 'No inventory record for this post yet.' });
  res.json({ inventory: withAvailable(item) });
});

// PUT /api/inventory/:postId — create or update (upsert) stock for a post
router.put('/:postId', async (req, res) => {
  const b = req.body || {};
  const data = {
    sku: b.sku ?? undefined,
    totalUnits: b.totalUnits != null ? Number(b.totalUnits) : undefined,
    reservedUnits: b.reservedUnits != null ? Number(b.reservedUnits) : undefined,
    damagedUnits: b.damagedUnits != null ? Number(b.damagedUnits) : undefined,
    lowStockThreshold: b.lowStockThreshold != null ? Number(b.lowStockThreshold) : undefined,
    location: b.location ?? undefined,
    costPrice: b.costPrice != null ? Number(b.costPrice) : undefined,
    notes: b.notes ?? undefined,
  };

  const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const item = await prisma.inventoryItem.upsert({
    where: { postId: req.params.postId },
    create: {
      postId: req.params.postId,
      sku: b.sku || null,
      totalUnits: b.totalUnits != null ? Number(b.totalUnits) : 1,
      reservedUnits: b.reservedUnits != null ? Number(b.reservedUnits) : 0,
      damagedUnits: b.damagedUnits != null ? Number(b.damagedUnits) : 0,
      lowStockThreshold: b.lowStockThreshold != null ? Number(b.lowStockThreshold) : 1,
      location: b.location || null,
      costPrice: b.costPrice != null ? Number(b.costPrice) : null,
      notes: b.notes || null,
    },
    update: data,
  });

  res.json({ inventory: withAvailable(item) });
});

// PATCH /api/inventory/:postId/adjust  { delta: -1 | +1, field: "reservedUnits" | "damagedUnits" | "totalUnits" }
// Quick +/- buttons in the admin UI use this instead of resubmitting the whole form.
router.patch('/:postId/adjust', async (req, res) => {
  const { delta, field } = req.body || {};
  const allowed = ['totalUnits', 'reservedUnits', 'damagedUnits'];
  if (!allowed.includes(field) || typeof delta !== 'number') {
    return res.status(400).json({ error: `field must be one of ${allowed.join(', ')} and delta must be a number.` });
  }
  const existing = await prisma.inventoryItem.findUnique({ where: { postId: req.params.postId } });
  if (!existing) return res.status(404).json({ error: 'No inventory record for this post yet.' });

  const nextValue = Math.max(0, existing[field] + delta);
  const item = await prisma.inventoryItem.update({
    where: { postId: req.params.postId },
    data: { [field]: nextValue },
  });
  res.json({ inventory: withAvailable(item) });
});

// DELETE /api/inventory/:postId
router.delete('/:postId', async (req, res) => {
  try {
    await prisma.inventoryItem.delete({ where: { postId: req.params.postId } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'No inventory record for this post.' });
    res.status(500).json({ error: 'Failed to delete inventory record.' });
  }
});

module.exports = router;
