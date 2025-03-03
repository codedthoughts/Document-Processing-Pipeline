const express = require('express');
const router = express.Router();
const multer = require('multer');
const Document = require('../models/document');
const queueService = require('../services/queueService');
const fileService = require('../services/fileService');
const { testS3Connection } = require('../config/s3');
const auth = require('../middleware/auth');

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 5 // Max 5 files at once
    }
});

// Test S3 connection on startup
testS3Connection().catch(console.error);

// Add auth middleware to all routes
router.use(auth);

// Upload documents
router.post('/upload', upload.array('files', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        console.log(`📥 Received ${req.files.length} files for upload`);
        const documentIds = [];
        const errors = [];

        for (const file of req.files) {
            try {
                // Create document record first with pending status
                const document = new Document({
                    userId: req.user.userId,
                    originalName: file.originalname,
                    status: 'pending',
                    mimeType: file.mimetype,
                    size: file.size
                });

                // Save document to get an ID
                const savedDoc = await document.save();
                
                try {
                    // Upload file to S3 with the document ID
                    const fileData = await fileService.uploadFile(file, req.user.userId);
                    
                    // Update document with S3 URL and status
                    savedDoc.originalUrl = fileData.url;
                    savedDoc.status = 'uploaded';
                    await savedDoc.save();
                    
                    // Add to processing queue
                    await queueService.addToQueue(savedDoc._id, req.user.userId);
                    
                    documentIds.push(savedDoc._id);
                    console.log(`✅ File ${file.originalname} uploaded and queued`);
                } catch (uploadError) {
                    // If S3 upload fails, update document status to failed
                    savedDoc.status = 'failed';
                    savedDoc.error = uploadError.message;
                    await savedDoc.save();
                    
                    throw uploadError;
                }
            } catch (fileError) {
                console.error(`❌ Error processing file ${file.originalname}:`, fileError);
                errors.push({
                    file: file.originalname,
                    error: fileError.message
                });
            }
        }

        if (documentIds.length === 0 && errors.length > 0) {
            return res.status(500).json({
                message: 'Failed to process all files',
                errors
            });
        }

        res.status(201).json({
            message: documentIds.length === req.files.length ? 
                'All documents uploaded successfully' : 
                'Some documents were uploaded successfully',
            documentIds,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ 
            message: 'Error uploading documents',
            error: error.message
        });
    }
});

// Get queue status
router.get('/queue/status', async (req, res) => {
    try {
        const status = await queueService.getQueueStatus();
        res.json(status);
    } catch (error) {
        console.error('❌ Error getting queue status:', error);
        res.status(500).json({ message: 'Error getting queue status' });
    }
});

// Get all documents for user
router.get('/', async (req, res) => {
    try {
        const documents = await Document.find({ userId: req.user.userId })
            .sort({ createdAt: -1 });
        res.json(documents);
    } catch (error) {
        console.error('❌ Error fetching documents:', error);
        res.status(500).json({ message: 'Error fetching documents' });
    }
});

// Search documents
router.get('/search/:keyword', async (req, res) => {
    try {
        const keyword = req.params.keyword;
        const documents = await Document.find({
            userId: req.user.userId,
            $or: [
                { originalName: { $regex: keyword, $options: 'i' } },
                { summary: { $regex: keyword, $options: 'i' } }
            ]
        }).sort({ createdAt: -1 });
        
        res.json(documents);
    } catch (error) {
        console.error('❌ Error searching documents:', error);
        res.status(500).json({ message: 'Error searching documents' });
    }
});

// Delete document
router.delete('/:id', async (req, res) => {
    try {
        const document = await Document.findOne({
            _id: req.params.id,
            userId: req.user.userId
        });

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        // Delete files from S3
        if (document.originalUrl) {
            await fileService.deleteFile(document.originalUrl);
        }
        if (document.processedUrl) {
            await fileService.deleteFile(document.processedUrl);
        }

        // Delete document record
        await document.remove();
        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        console.error('❌ Error deleting document:', error);
        res.status(500).json({ message: 'Error deleting document' });
    }
});

module.exports = router;
