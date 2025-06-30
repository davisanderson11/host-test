const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// Ensure upload directory exists
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const ensureUploadDir = async (experimentId) => {
  const dir = path.join(UPLOAD_DIR, 'experiments', experimentId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

// Configure storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const dir = await ensureUploadDir(req.params.id);
      cb(null, dir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Sanitize filename and preserve extension
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 100);
    cb(null, `${name}${ext}`);
  }
});

// File filter - only allow specific file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'text/html',
    'text/css',
    'application/javascript',
    'text/javascript',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/svg+xml',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'video/mp4',
    'video/webm',
    'application/json',
    'text/plain'
  ];

  const allowedExtensions = [
    '.html', '.htm', '.css', '.js', '.json',
    '.jpg', '.jpeg', '.png', '.gif', '.svg',
    '.mp3', '.wav', '.ogg',
    '.mp4', '.webm',
    '.txt'
  ];

  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.originalname}`), false);
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 100 // Max 100 files per upload
  }
});

module.exports = {
  upload,
  ensureUploadDir,
  UPLOAD_DIR
};