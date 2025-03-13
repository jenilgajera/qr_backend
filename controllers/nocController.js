const Noc = require('../models/Noc');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Register NOC
exports.registerNoc = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Photo is required' });
    }

    // Generate NOC number
    const nocNumber = await Noc.generateNocNumber();

    // Save photo locally
    const photoFileName = `photo-${uuidv4()}${path.extname(req.file.originalname)}`;
    const photoPath = path.join(__dirname, '../uploads/photos', photoFileName);
    fs.writeFileSync(photoPath, req.file.buffer);
    const photoUrl = `/uploads/photos/${photoFileName}`;

    // Generate QR code that points to PDF download
    const qrCodeBuffer = await generateQRCode(`${req.protocol}://${req.get('host')}/api/noc/pdf/${nocNumber}`);

    // Save QR code locally
    const qrCodeFileName = `qrcode-${uuidv4()}.png`;
    const qrCodePath = path.join(__dirname, '../uploads/qrcodes', qrCodeFileName);
    fs.writeFileSync(qrCodePath, qrCodeBuffer);
    const qrCodeUrl = `/uploads/qrcodes/${qrCodeFileName}`;

    // Create new NOC document
    const noc = new Noc({
      fullName: req.body.fullName,
      email: req.body.email,
      phone: req.body.phone,
      company: req.body.company,
      designation: req.body.designation,
      purpose: req.body.purpose,
      validFrom: req.body.validFrom,
      validTo: req.body.validTo,
      idProofType: req.body.idProofType,
      idProofNumber: req.body.idProofNumber,
      address: req.body.address,
      photoUrl: photoUrl,
      nocNumber: nocNumber,
      qrCodeUrl: qrCodeUrl
    });

    await noc.save();

    // Generate PDF and save locally
    const pdfBuffer = await generateNocPdf(noc);
    const pdfFileName = `${nocNumber}.pdf`;
    const pdfPath = path.join(__dirname, '../uploads/pdfs', pdfFileName);
    fs.writeFileSync(pdfPath, pdfBuffer);
    const pdfUrl = `/uploads/pdfs/${pdfFileName}`;

    // Update NOC with PDF URL
    noc.pdfUrl = pdfUrl;
    await noc.save();

    res.status(201).json({
      message: 'NOC registered successfully',
      nocId: nocNumber
    });

  } catch (error) {
    console.error('Error registering NOC:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Get QR code
exports.getQRCode = async (req, res) => {
  try {
    const noc = await Noc.findOne({ nocNumber: req.params.nocId });

    if (!noc) {
      return res.status(404).json({ message: 'NOC not found' });
    }

    // Serve the QR code file
    const qrCodePath = path.join(__dirname, '..', noc.qrCodeUrl);
    res.sendFile(qrCodePath);

  } catch (error) {
    console.error('Error fetching QR code:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Fetch all NOC details
// Fetch all NOC details
exports.getAllNocs = async (req, res) => {
  try {
    // Fetch all NOC records from the database with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const nocs = await Noc.find({})
      .sort({ createdAt: -1 }) // Sort by creation date (newest first)
      .skip(skip)
      .limit(limit);

    const total = await Noc.countDocuments();

    // Return the NOC records with pagination metadata
    res.status(200).json({
      message: 'NOC details fetched successfully',
      data: nocs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching NOC details:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Download PDF
exports.downloadPdf = async (req, res) => {
  try {
    const noc = await Noc.findOne({ nocNumber: req.params.nocId });

    if (!noc) {
      return res.status(404).json({ message: 'NOC not found' });
    }

    // Serve the PDF file
    const pdfPath = path.join(__dirname, '..', noc.pdfUrl);
    res.sendFile(pdfPath);

  } catch (error) {
    console.error('Error downloading PDF:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Generate QR Code (returns buffer)
async function generateQRCode(url) {
  return new Promise((resolve, reject) => {
    QRCode.toBuffer(url, (err, buffer) => {
      if (err) reject(err);
      else resolve(buffer);
    });
  });
}

// Generate NOC PDF (returns buffer)
async function generateNocPdf(noc) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4' });
      const buffers = [];

      // Collect PDF data chunks
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // Add header
      doc.fontSize(18).text('NO OBJECTION CERTIFICATE', { align: 'center' });
      doc.moveDown();
      doc.fontSize(14).text(`Certificate Number: ${noc.nocNumber}`, { align: 'center' });
      doc.moveDown(2);

      // Add photo if exists
      if (noc.photoUrl) {
        const photoPath = path.join(__dirname, '..', noc.photoUrl);
        const photoBuffer = fs.readFileSync(photoPath);
        doc.image(photoBuffer, { width: 100, align: 'right' });
      }

      // Add details
      doc.moveDown();
      doc.fontSize(12);

      const details = [
        { label: 'Full Name', value: noc.fullName },
        { label: 'Email', value: noc.email },
        { label: 'Phone', value: noc.phone },
        { label: 'Company/Organization', value: noc.company },
        { label: 'Designation', value: noc.designation },
        { label: 'ID Type', value: getIdProofTypeName(noc.idProofType) },
        { label: 'ID Number', value: noc.idProofNumber },
        { label: 'Address', value: noc.address },
        { label: 'Purpose', value: noc.purpose },
        { label: 'Valid From', value: new Date(noc.validFrom).toLocaleDateString() },
        { label: 'Valid To', value: new Date(noc.validTo).toLocaleDateString() },
        { label: 'Issued On', value: new Date(noc.createdAt).toLocaleDateString() }
      ];

      details.forEach(item => {
        doc.text(`${item.label}: ${item.value}`);
        doc.moveDown(0.5);
      });

      // Add QR code
      doc.moveDown(2);
      doc.fontSize(12).text('Scan to verify this certificate:', { align: 'center' });

      if (noc.qrCodeUrl) {
        const qrCodePath = path.join(__dirname, '..', noc.qrCodeUrl);
        const qrBuffer = fs.readFileSync(qrCodePath);
        doc.image(qrBuffer, { width: 150, align: 'center' });
      }

      // Add footer
      doc.moveDown(2);
      doc.fontSize(10).text('This is an electronically generated certificate.', { align: 'center' });
      doc.text('No signature is required.', { align: 'center' });

      // Finalize the PDF
      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

// Helper function to get ID proof type name
function getIdProofTypeName(type) {
  const types = {
    'aadhar': 'Aadhar Card',
    'pan': 'PAN Card',
    'passport': 'Passport',
    'driving': 'Driving License',
    'voter': 'Voter ID'
  };

  return types[type] || type;
}