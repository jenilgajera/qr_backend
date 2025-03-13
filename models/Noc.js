const mongoose = require('mongoose');

const nocSchema = new mongoose.Schema({
  nocNumber: {
    type: String,
    required: true,
    unique: true,
    index: true // Add index for faster lookup
  },
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  company: { type: String, required: true },
  designation: { type: String, required: true },
  purpose: { type: String, required: true },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, required: true },
  idProofType: { type: String, required: true },
  idProofNumber: { type: String, required: true },
  address: { type: String, required: true },
  photoUrl: { type: String },
  qrCodeUrl: { type: String },
  pdfUrl: { type: String },
  status: {
    type: String,
    enum: ['pending', 'active', 'expired', 'revoked'],
    default: 'pending'
  }
}, { timestamps: true });

// Fast method to generate NOC number without database lookup
nocSchema.statics.generateNocNumber = function() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const timestamp = date.getTime().toString().slice(-6);
  return `NOC-${year}-${month}-${day}-${timestamp}`;
};

// Only create the model if it doesn't already exist
const Noc = mongoose.models.Noc || mongoose.model('Noc', nocSchema);

module.exports = Noc;