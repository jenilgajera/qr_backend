const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
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

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const nocRoutes = require('./routes/nocRoutes');
app.use('/api/noc', nocRoutes);

// Simple health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route
app.get('/', (req, res) => {
  res.send('Welcome to the NOC Registration API');
});

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

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export the Express app for Vercel
module.exports = app;