const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function fileFilter(req, file, cb) {
  const ok = /jpeg|jpg|png|webp/i.test(file.mimetype);
  if (!ok) return cb(new Error('Only JPG, JPEG, PNG, and WEBP images are allowed.'));
  cb(null, true);
}

// multer keeps the file in memory; we stream it to Cloudinary ourselves.
// (Avoids the multer-storage-cloudinary package, which pins an old
// cloudinary@1.x peer dependency that conflicts with cloudinary@2.x.)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per image
});

function uploadBufferToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'utsav-showroom', transformation: [{ width: 2000, height: 2000, crop: 'limit' }] },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

module.exports = { cloudinary, upload, uploadBufferToCloudinary };
