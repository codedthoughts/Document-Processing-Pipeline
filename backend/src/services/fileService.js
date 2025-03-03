const { uploadToS3, deleteFromS3 } = require('../config/s3');
const path = require('path');
const crypto = require('crypto');

class FileService {
    constructor() {
        this.allowedTypes = {
            'application/pdf': 'pdf',
            'text/plain': 'txt',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'image/jpeg': 'jpg',
            'image/png': 'png'
        };
    }

    generateFileName(originalName, userId) {
        const timestamp = Date.now();
        const randomString = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(originalName);
        return `${userId}/${timestamp}-${randomString}${ext}`;
    }

    async uploadFile(file, userId) {
        try {
            if (!this.allowedTypes[file.mimetype]) {
                throw new Error('File type not supported');
            }

            // Generate unique file name
            const key = this.generateFileName(file.originalname, userId);
            
            // Upload to S3
            const url = await uploadToS3(file, key);
            
            return {
                key,
                url,
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size
            };
        } catch (error) {
            console.error('❌ Error in file upload:', error);
            throw error;
        }
    }

    async deleteFile(key) {
        try {
            await deleteFromS3(key);
        } catch (error) {
            console.error('❌ Error in file deletion:', error);
            throw error;
        }
    }
}

module.exports = new FileService();
