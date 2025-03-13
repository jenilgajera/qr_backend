const express = require('express');
const router = express.Router();
const nocController = require('../controllers/nocController');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/photos'); // Save files to the 'uploads/photos' directory
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext); // Generate unique filenames
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Register a new NOC
router.post('/register', upload.single('photo'), nocController.registerNoc);

// Get QR code
router.get('/qr/:nocId', nocController.getQRCode);

// Download PDF
router.get('/pdf/:nocId', nocController.downloadPdf);

// Fetch all NOC details
router.get('/all', nocController.getAllNocs);

module.exports = router;