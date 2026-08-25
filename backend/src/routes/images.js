const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');
const { cloudinary, upload, uploadBufferToCloudinary } = require('../lib/cloudinary');
const router = express.Router();

router.use(requireAdmin);

// POST /api/images/upload  (multipart/form-data, field name "image")
// Optional body fields: postId, alt, setCover ("1"|"0"), sortOrder
router.post('/upload', (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'No image file received.' });

    try {
      const result = await uploadBufferToCloudinary(req.file.buffer);
      const image = await prisma.image.create({
        data: {
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width || null,
          height: result.height || null,
          alt: req.body.alt || null,
          sortOrder: req.body.sortOrder ? Number(req.body.sortOrder) : 0,
          postId: req.body.postId || null,
        },
      });

      if (req.body.postId && req.body.setCover === '1') {
        await prisma.post.update({ where: { id: req.body.postId }, data: { coverImageId: image.id } });
      }

      res.status(201).json({ image });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Image upload failed.' });
    }
  });
});

// PUT /api/images/:id/replace — uploads a new file, swaps it in, deletes the old Cloudinary asset
router.put('/:id/replace', (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'No image file received.' });

    const existing = await prisma.image.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Image not found.' });

    try {
      const result = await uploadBufferToCloudinary(req.file.buffer);
      const updated = await prisma.image.update({
        where: { id: req.params.id },
        data: { url: result.secure_url, publicId: result.public_id, width: result.width || null, height: result.height || null },
      });

      if (existing.publicId) {
        cloudinary.uploader.destroy(existing.publicId).catch((e) => console.error('Cloudinary cleanup failed:', e.message));
      }

      res.json({ image: updated });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Image replace failed.' });
    }
  });
});

// PUT /api/images/:id — metadata only (alt text, sortOrder, attach to post)
router.put('/:id', async (req, res) => {
  const { alt, sortOrder, postId } = req.body || {};
  const data = {};
  if (alt !== undefined) data.alt = alt;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;
  if (postId !== undefined) data.postId = postId;
  try {
    const image = await prisma.image.update({ where: { id: req.params.id }, data });
    res.json({ image });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Image not found.' });
    res.status(500).json({ error: 'Failed to update image.' });
  }
});

// DELETE /api/images/:id — removes from Cloudinary and the database
router.delete('/:id', async (req, res) => {
  const existing = await prisma.image.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Image not found.' });

  await prisma.post.updateMany({ where: { coverImageId: existing.id }, data: { coverImageId: null } });
  await prisma.image.delete({ where: { id: req.params.id } });

  if (existing.publicId) {
    cloudinary.uploader.destroy(existing.publicId).catch((e) => console.error('Cloudinary cleanup failed:', e.message));
  }

  res.json({ ok: true });
});

// PATCH /api/images/reorder  { order: [id, id, id] }
router.patch('/reorder', async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of image ids.' });
  await prisma.$transaction(order.map((id, i) => prisma.image.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

module.exports = router;
