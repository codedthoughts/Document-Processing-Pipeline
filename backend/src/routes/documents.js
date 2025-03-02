const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Queue = require('bull');
const auth = require('../middleware/auth');
const Document = require('../models/document');
const fs = require('fs');

// Define directory paths
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const PROCESSED_DIR = path.join(UPLOAD_DIR, 'processed');
const ORIGINAL_DIR = path.join(UPLOAD_DIR, 'original');
const TEMP_DIR = path.join(UPLOAD_DIR, 'temp');

// Ensure all required directories exist
[UPLOAD_DIR, PROCESSED_DIR, ORIGINAL_DIR, TEMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: TEMP_DIR,
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'text/plain',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// Initialize processing queue
const documentQueue = new Queue('document-processing', process.env.REDIS_URL);

// Reset queue counters on startup
(async () => {
    try {
        await documentQueue.empty();
        await documentQueue.clean(0, 'completed');
        await documentQueue.clean(0, 'failed');
        console.log('✨ Queue counters reset successfully');
    } catch (error) {
        console.error('❌ Error resetting queue:', error);
    }
})();

// Get queue status
router.get('/queue/status', auth, async (req, res) => {
    try {
        const [waiting, active, completed, failed] = await Promise.all([
            documentQueue.getWaitingCount(),
            documentQueue.getActiveCount(),
            documentQueue.getCompletedCount(),
            documentQueue.getFailedCount()
        ]);

        res.json({
            waiting,
            active,
            completed,
            failed,
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Upload document
router.post('/upload', auth, upload.array('files'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        const documents = [];
        const jobs = [];

        for (const file of req.files) {
            const document = new Document({
                userId: req.user.userId,
                originalName: file.originalname,
                fileName: file.filename,
                fileType: file.mimetype,
                status: 'processing'
            });

            await document.save();
            documents.push(document._id);

            // Add document to processing queue
            const job = await documentQueue.add({
                filePath: file.path,
                fileType: file.mimetype,
                fileName: file.filename,
                documentId: document._id
            });
            
            jobs.push(job.id);
        }

        // Return immediately after queueing all jobs
        res.status(201).json({ documentIds: documents, jobIds: jobs });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get document by id
router.get('/:id', auth, async (req, res) => {
    try {
        const document = await Document.findOne({
            _id: req.params.id,
            userId: req.user.userId
        });

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        res.json(document);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Search documents
router.get('/search/:keyword', auth, async (req, res) => {
    try {
        const documents = await Document.find({
            userId: req.user.userId,
            status: 'completed',
            $text: { $search: req.params.keyword }
        });

        res.json(documents);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get all documents for user
router.get('/', auth, async (req, res) => {
    try {
        const documents = await Document.find({
            userId: req.user.userId
        }).sort({ createdAt: -1 });

        res.json(documents);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update document queue processor
documentQueue.process(async (job) => {
    const { filePath, fileType, fileName, documentId } = job.data;
    const document = await Document.findById(documentId);

    // Check if document is already processed or failed
    if (document.status === 'completed') {
        console.log(`📝 Document ${fileName} already processed, skipping...`);
        return { success: true };
    }

    // Check if the document is already being processed by another job
    const activeJobs = await documentQueue.getActive();
    const isBeingProcessed = activeJobs.some(
        activeJob => 
            activeJob.id !== job.id && 
            activeJob.data.documentId.toString() === documentId.toString()
    );

    if (isBeingProcessed) {
        console.log(`⏳ Document ${fileName} is being processed by another job, skipping...`);
        return { success: true };
    }

    try {
        const { text, summary, fileUrl } = await require('../workers/documentProcessor').processDocument(filePath, fileType, fileName);
        
        document.text = text;
        document.summary = summary;
        document.originalUrl = `/uploads/original/${fileName}`;
        document.processedUrl = fileUrl;
        document.status = 'completed';
        await document.save();

        return { success: true };
    } catch (error) {
        // Only update status if it hasn't been completed by another job
        const currentDoc = await Document.findById(documentId);
        if (currentDoc.status !== 'completed') {
            document.status = 'failed';
            document.error = error.message;
            await document.save();
        }
        throw error;
    }
});

// Add queue error handler
documentQueue.on('failed', async (job, err) => {
    console.error(`❌ Job failed for ${job.data.fileName}:`, err);
    const document = await Document.findById(job.data.documentId);
    if (document && document.status !== 'completed') {
        document.status = 'failed';
        document.error = err.message;
        await document.save();
    }
});

// Add queue completion handler
documentQueue.on('completed', async (job) => {
    console.log(`✅ Job completed for ${job.data.fileName}`);
});

module.exports = router;
