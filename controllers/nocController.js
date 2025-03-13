const Noc = require('../models/Noc');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const stream = require('stream');

// You'll need to set up a cloud storage solution
// This example assumes AWS S3, but you can use any cloud storage service
// Add AWS SDK or your preferred cloud storage SDK to your dependencies
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Register NOC
exports.registerNoc = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Photo is required' });
    }

    // Generate NOC number
    const nocNumber = await Noc.generateNocNumber();
    
    // Upload photo to S3
    const photoKey = `photos/${uuidv4()}-${req.file.originalname}`;
    const photoUploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: photoKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: 'public-read'
    };
    
    const photoUploadResult = await s3.upload(photoUploadParams).promise();
    const photoUrl = photoUploadResult.Location;
    
    // Generate QR code that points to PDF download
    const qrCodeBuffer = await generateQRCode(`${req.protocol}://${req.get('host')}/api/noc/pdf/${nocNumber}`);
    
    // Upload QR code to S3
    const qrCodeKey = `qrcodes/${uuidv4()}.png`;
    const qrCodeUploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: qrCodeKey,
      Body: qrCodeBuffer,
      ContentType: 'image/png',
      ACL: 'public-read'
    };
    
    const qrCodeUploadResult = await s3.upload(qrCodeUploadParams).promise();
    const qrCodeUrl = qrCodeUploadResult.Location;
    
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
    
    // Generate PDF and upload to S3
    const pdfBuffer = await generateNocPdf(noc);
    const pdfKey = `pdfs/${nocNumber}.pdf`;
    const pdfUploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: pdfKey,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ACL: 'public-read'
    };
    
    const pdfUploadResult = await s3.upload(pdfUploadParams).promise();
    
    // Update NOC with PDF URL
    noc.pdfUrl = pdfUploadResult.Location;
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
    
    // Redirect to the QR code URL
    res.redirect(noc.qrCodeUrl);
    
  } catch (error) {
    console.error('Error fetching QR code:', error);
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
    
    // Redirect to the PDF URL
    res.redirect(noc.pdfUrl);
    
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
        // Fetch photo from S3
        const photoResponse = await fetch(noc.photoUrl);
        const photoBuffer = await photoResponse.buffer();
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
        // Fetch QR code from S3
        const qrResponse = await fetch(noc.qrCodeUrl);
        const qrBuffer = await qrResponse.buffer();
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