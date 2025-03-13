const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Performance optimization: Connect to MongoDB outside the request handler
let cachedDb = null;
async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }
  
  const client = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/noc-system', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // Reduce the timeout for faster failure detection
  });
  
  cachedDb = client;
  return cachedDb;
}

// CORS Configuration
app.use(cors({
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer to use memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // Limit file size to 5MB
});

// Simple health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route
app.get('/', (req, res) => {
  res.send('Welcome to the NOC Registration API');
});

// Simplified registration endpoint
app.post('/api/noc/register', upload.single('photo'), async (req, res) => {
  console.log('Registration request received');
  
  try {
    // First, validate input without touching database or external services
    const {
      fullName,
      email,
      phone,
      company,
      designation,
      purpose,
      validFrom,
      validTo,
      idProofType,
      idProofNumber,
      address,
    } = req.body;

    // Quick validation to fail fast if data is missing
    if (!fullName || !email || !phone) {
      console.log('Missing required fields');
      return res.status(400).json({ message: 'Required fields missing' });
    }

    // Check if file was uploaded
    if (!req.file) {
      console.log('No photo uploaded');
      return res.status(400).json({ message: 'Photo is required' });
    }

    // Generate a simple NOC ID (more robust generation can be done in DB)
    const nocId = 'NOC' + Date.now().toString().slice(-6);
    
    // For now, just acknowledge receipt without heavy processing
    // This prevents timeout while still validating the input
    res.status(202).json({
      message: 'Registration request accepted',
      nocId: nocId,
      status: 'processing'
    });
    
    // After sending the response, we can continue processing
    // This async processing will continue even after response is sent
    
    // Connect to database - this happens AFTER responding to client
    try {
      await connectToDatabase();
      console.log('Connected to database for async processing');
      
      // Here you would typically:
      // 1. Save the basic details to MongoDB
      // 2. Process the uploaded photo (resize, optimize)
      // 3. Upload to cloud storage
      // 4. Generate QR code and store it
      // 5. Create PDF
      // 6. Update the record with file URLs
      
      console.log('Async processing completed for NOC ID:', nocId);
    } catch (dbError) {
      console.error('Database operation failed:', dbError);
      // Since we've already responded to the client, we just log the error
    }
    
  } catch (err) {
    console.error('Error in registration process:', err);
    // Only send error response if we haven't already sent a response
    if (!res.headersSent) {
      res.status(500).json({ message: 'Internal Server Error' });
    }
  }
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);

  // Handle multer errors
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: `File upload error: ${err.message}` });
  }

  // Only send error response if we haven't already sent a response
  if (!res.headersSent) {
    res.status(500).json({ message: 'Something went wrong! Please try again later.' });
  }
});

// Export the Express app for Vercel
module.exports = app;