const { Redis } = require('@upstash/redis');
require('dotenv').config();

// Validate Redis configuration
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error('❌ Redis configuration missing. Please check your .env file for:');
    console.error('   - UPSTASH_REDIS_REST_URL');
    console.error('   - UPSTASH_REDIS_REST_TOKEN');
    process.exit(1);
}

// Create Redis client with Upstash configuration
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Test the connection
async function testRedisConnection() {
    try {
        console.log('🔄 Testing Redis connection...');
        await redis.ping();
        console.log('✅ Successfully connected to Upstash Redis');
    } catch (error) {
        console.error('❌ Failed to connect to Upstash Redis:', error);
        throw error;
    }
}

// Initialize Redis connection
testRedisConnection().catch(error => {
    console.error('❌ Redis connection failed:', error);
    process.exit(1);
});

module.exports = {
    redis,
    testRedisConnection
};
