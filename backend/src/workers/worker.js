require('dotenv').config();
const { processDocument } = require('./documentProcessor');
const { redis } = require('../config/redis');
const queueService = require('../services/queueService');
const Document = require('../models/document');
const mongoose = require('mongoose');
const axios = require('axios');

// Configure Mongoose for the worker
mongoose.set('maxTimeMS', 30000); // Set default timeout to 30 seconds

async function connectToMongoDB() {
    try {
        if (mongoose.connection.readyState !== 1) {
            console.log('🔌 Worker connecting to MongoDB...');
            await mongoose.connect(process.env.MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 30000,
                maxPoolSize: 10,
                minPoolSize: 2,
                dbName: 'document-processor'
            });
            console.log('✅ Worker connected to MongoDB');
        }
    } catch (error) {
        console.error('❌ Worker MongoDB connection error:', error);
        throw error;
    }
}

async function downloadFile(url) {
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer'
        });
        return Buffer.from(response.data);
    } catch (error) {
        console.error('❌ Error downloading file:', error);
        throw error;
    }
}

async function startWorker() {
    console.log('🚀 Starting document processing worker...');
    
    while (true) {
        try {
            // Ensure MongoDB connection
            await connectToMongoDB();

            // Get next document from queue
            const item = await queueService.getNextDocument();
            if (!item) {
                // No documents to process, wait for 5 seconds
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            const { documentId, userId } = item;
            console.log(`\n📄 Processing document: ${documentId}`);

            // Get document from database with timeout
            const document = await Document.findById(documentId).maxTimeMS(30000);
            if (!document) {
                console.error(`❌ Document not found: ${documentId}`);
                await queueService.markAsFailed(documentId, userId, new Error('Document not found'));
                continue;
            }

            try {
                // Update document status
                document.status = 'processing';
                await document.save({ maxTimeMS: 30000 });

                // Download the file from S3
                const fileBuffer = await downloadFile(document.originalUrl);
                
                // Process the document
                const fileData = {
                    buffer: fileBuffer,
                    mimetype: document.mimeType,
                    originalname: document.originalName
                };
                
                const { text, summary, fileUrl } = await processDocument(fileData, userId);

                // Update document with results
                document.text = text;
                document.summary = summary;
                document.processedUrl = fileUrl;
                document.status = 'completed';
                await document.save({ maxTimeMS: 30000 });

                // Mark as complete in queue
                await queueService.markAsComplete(documentId, userId);
                
                console.log(`✅ Document ${documentId} processed successfully`);
            } catch (error) {
                console.error(`❌ Error processing document ${documentId}:`, error);
                
                // Update document status
                document.status = 'failed';
                document.error = error.message;
                await document.save({ maxTimeMS: 30000 }).catch(saveError => {
                    console.error('❌ Error saving failed status:', saveError);
                });

                // Mark as failed in queue
                await queueService.markAsFailed(documentId, userId, error);
            }
        } catch (error) {
            console.error('❌ Worker error:', error);
            
            // Handle MongoDB connection errors
            if (error.name === 'MongooseError' || error.name === 'MongoError') {
                console.log('🔄 MongoDB error detected, attempting to reconnect...');
                try {
                    await mongoose.disconnect();
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    await connectToMongoDB();
                } catch (reconnectError) {
                    console.error('❌ Failed to reconnect to MongoDB:', reconnectError);
                }
            }
            
            // Wait before retrying on error
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// Initialize MongoDB connection and start the worker
console.log('🔄 Initializing document processing worker...');
connectToMongoDB()
    .then(() => startWorker())
    .catch(error => {
        console.error('❌ Failed to start worker:', error);
        process.exit(1);
    });
