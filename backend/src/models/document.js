const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    originalName: {
        type: String,
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        required: true
    },
    text: {
        type: String
    },
    summary: {
        type: String
    },
    originalUrl: {
        type: String
    },
    processedUrl: {
        type: String
    },
    status: {
        type: String,
        enum: ['processing', 'completed', 'failed'],
        default: 'processing'
    },
    error: {
        type: String
    }
}, {
    timestamps: true
});

// Add text index for search functionality
documentSchema.index({ text: 'text', summary: 'text' });

module.exports = mongoose.model('Document', documentSchema);
