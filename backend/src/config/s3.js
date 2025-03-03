const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_REGION || 'ap-south-1' // Using Mumbai region as default
});

// Create S3 instance
const s3 = new AWS.S3();

// Test S3 connection
async function testS3Connection() {
    try {
        console.log('🔄 Testing S3 connection...');
        await s3.listBuckets().promise();
        console.log('✅ Successfully connected to AWS S3');
    } catch (error) {
        console.error('❌ Failed to connect to AWS S3:', error);
        throw error;
    }
}

// Upload file to S3
async function uploadToS3(file, key) {
    try {
        console.log(`📤 Uploading file to S3: ${key}`);
        const result = await s3.upload({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype
        }).promise();
        
        console.log(`✅ File uploaded successfully: ${result.Location}`);
        return result.Location;
    } catch (error) {
        console.error(`❌ Error uploading file to S3: ${error.message}`);
        throw error;
    }
}

// Delete file from S3
async function deleteFromS3(key) {
    try {
        console.log(`🗑️ Deleting file from S3: ${key}`);
        await s3.deleteObject({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key
        }).promise();
        console.log('✅ File deleted successfully');
    } catch (error) {
        console.error(`❌ Error deleting file from S3: ${error.message}`);
        throw error;
    }
}

module.exports = {
    s3,
    testS3Connection,
    uploadToS3,
    deleteFromS3
};
