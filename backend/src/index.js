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

// Define upload directories
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const PROCESSED_DIR = path.join(UPLOAD_DIR, 'processed');
const ORIGINAL_DIR = path.join(UPLOAD_DIR, 'original');
const TEMP_DIR = path.join(UPLOAD_DIR, 'temp');

// Serve static files from uploads directories
app.use('/uploads/processed', express.static(PROCESSED_DIR));
app.use('/uploads/original', express.static(ORIGINAL_DIR));
app.use('/uploads/temp', express.static(TEMP_DIR));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
