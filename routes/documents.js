const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_PATH || './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|xls|xlsx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Upload document
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { service_order_id, document_type } = req.body;

    const [result] = await db.query(`
      INSERT INTO documents (service_order_id, document_name, document_type, file_path, file_size, mime_type, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      service_order_id,
      req.file.originalname,
      document_type,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      req.user.id
    ]);

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      documentId: result.insertId,
      fileName: req.file.originalname
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get documents for service order
router.get('/service-order/:id', auth, async (req, res) => {
  try {
    const [documents] = await db.query(`
      SELECT d.*, u.first_name, u.last_name
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.service_order_id = ?
      ORDER BY d.upload_date DESC
    `, [req.params.id]);

    res.json({ success: true, data: documents });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Download document
router.get('/download/:id', auth, async (req, res) => {
  try {
    const [documents] = await db.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);

    if (documents.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const document = documents[0];
    const filePath = path.resolve(document.file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    res.download(filePath, document.document_name);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete document
router.delete('/:id', auth, async (req, res) => {
  try {
    const [documents] = await db.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);

    if (documents.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const document = documents[0];

    // Delete file from filesystem
    if (fs.existsSync(document.file_path)) {
      fs.unlinkSync(document.file_path);
    }

    // Delete from database
    await db.query('DELETE FROM documents WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
