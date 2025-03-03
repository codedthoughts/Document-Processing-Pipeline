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
    originalUrl: {
        type: String,
        default: null
    },
    processedUrl: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'uploaded', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    mimeType: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    summary: {
        type: String
    },
    text: {
        type: String
    },
    error: {
        type: String
    }
}, {
    timestamps: true
});

// Create indexes for better search performance
documentSchema.index({ originalName: 'text', summary: 'text' });

const Document = mongoose.model('Document', documentSchema);
module.exports = Document;
