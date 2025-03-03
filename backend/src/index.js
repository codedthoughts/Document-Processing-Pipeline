require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Debug middleware
app.use((req, res, next) => {
    console.log(`\n📨 Request:`, {
        method: req.method,
        path: req.path,
        body: req.body
    });
    next();
});

// Define upload directories
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const PROCESSED_DIR = path.join(UPLOAD_DIR, 'processed');
const ORIGINAL_DIR = path.join(UPLOAD_DIR, 'original');
const TEMP_DIR = path.join(UPLOAD_DIR, 'temp');

// Serve static files from uploads directories
app.use('/uploads/processed', express.static(PROCESSED_DIR));
app.use('/uploads/original', express.static(ORIGINAL_DIR));
app.use('/uploads/temp', express.static(TEMP_DIR));

// MongoDB Connection with proper error handling
async function connectToMongoDB() {
    try {
        console.log('🔌 Attempting to connect to MongoDB Atlas...');
        
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
            dbName: 'document-processor',
            retryWrites: true,
            w: 'majority',
            keepAlive: true,
            keepAliveInitialDelay: 300000, // 5 minutes
            maxPoolSize: 50,
            minPoolSize: 10
        });

        console.log('✅ Successfully connected to MongoDB Atlas');
        
        // Test the connection
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('📚 Available collections:', collections.map(c => c.name));
        
        // Setup connection event handlers
        mongoose.connection.on('error', async (err) => {
            console.error('❌ MongoDB error:', err);
            // Attempt to reconnect on error
            if (!mongoose.connection.readyState) {
                console.log('🔄 Attempting to reconnect to MongoDB...');
                try {
                    await mongoose.connect(process.env.MONGODB_URI);
                } catch (reconnectError) {
                    console.error('❌ MongoDB reconnection failed:', reconnectError);
                }
            }
        });

        mongoose.connection.on('disconnected', async () => {
            console.log('❗ MongoDB disconnected');
            // Attempt to reconnect
            try {
                await mongoose.connect(process.env.MONGODB_URI);
            } catch (reconnectError) {
                console.error('❌ MongoDB reconnection failed:', reconnectError);
            }
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });

    } catch (error) {
        console.error('❌ MongoDB connection error:', {
            name: error.name,
            message: error.message,
            code: error.code,
            codeName: error.codeName
        });
        
        if (error.name === 'MongoServerSelectionError') {
            console.error('Could not connect to any MongoDB server.');
            console.error('Please check:');
            console.error('1. Network connectivity');
            console.error('2. MongoDB Atlas whitelist settings');
            console.error('3. Database user credentials');
            console.error('4. Database name and collection permissions');
        }
        
        // Instead of exiting, throw the error to be handled by the caller
        throw error;
    }
}

// Connect to MongoDB before starting the server
connectToMongoDB().then(() => {
    // Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/documents', documentRoutes);

    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error('❌ Error:', {
            message: err.message,
            stack: err.stack,
            details: err
        });
        
        res.status(500).json({ 
            message: 'Something went wrong!',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    });

    // Start server only after MongoDB connection is established
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to start server:', err);
    // Instead of exiting immediately, wait a bit and try to reconnect
    setTimeout(() => {
        console.log('🔄 Attempting to restart server...');
        connectToMongoDB().catch(error => {
            console.error('❌ Server restart failed:', error);
            process.exit(1);
        });
    }, 5000);
});
