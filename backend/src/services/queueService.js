const { redis } = require('../config/redis');

class QueueService {
    constructor() {
        this.queues = {
            processing: 'document_processing_queue',
            completed: 'completed_documents',
            failed: 'failed_documents'
        };
    }

    async addToQueue(documentId, userId) {
        try {
            console.log(`📥 Adding document ${documentId} to processing queue`);
            
            const queueItem = {
                documentId,
                userId,
                timestamp: Date.now()
            };
            
            // Add to processing queue with timestamp
            await redis.rpush(this.queues.processing, JSON.stringify(queueItem));

            // Increment waiting count
            await redis.hincrby('queue_counters', 'waiting', 1);
            
            console.log(`✅ Document ${documentId} added to queue`);
        } catch (error) {
            console.error('❌ Error adding to queue:', error);
            throw error;
        }
    }

    async markAsComplete(documentId, userId) {
        try {
            console.log(`✨ Marking document ${documentId} as complete`);
            
            const queueItem = {
                documentId,
                userId,
                timestamp: Date.now()
            };
            
            // Add to completed queue
            await redis.rpush(this.queues.completed, JSON.stringify(queueItem));

            // Update counters
            await redis.hincrby('queue_counters', 'completed', 1);
            await redis.hincrby('queue_counters', 'active', -1);
            
            console.log(`✅ Document ${documentId} marked as complete`);
        } catch (error) {
            console.error('❌ Error marking as complete:', error);
            throw error;
        }
    }

    async markAsFailed(documentId, userId, error) {
        try {
            console.log(`❌ Marking document ${documentId} as failed`);
            
            const queueItem = {
                documentId,
                userId,
                error: error.message || 'Unknown error',
                timestamp: Date.now()
            };
            
            // Add to failed queue with error info
            await redis.rpush(this.queues.failed, JSON.stringify(queueItem));

            // Update counters
            await redis.hincrby('queue_counters', 'failed', 1);
            await redis.hincrby('queue_counters', 'active', -1);
            
            console.log(`Document ${documentId} marked as failed`);
        } catch (error) {
            console.error('❌ Error marking as failed:', error);
            throw error;
        }
    }

    async getNextDocument() {
        try {
            // Get next document from processing queue
            const item = await redis.lpop(this.queues.processing);
            if (!item) return null;

            let parsedItem;
            try {
                // Handle both string and object responses from Redis
                parsedItem = typeof item === 'string' ? JSON.parse(item) : item;
            } catch (error) {
                console.error('❌ Error parsing queue item:', error);
                return null;
            }

            // Update counters
            await redis.hincrby('queue_counters', 'waiting', -1);
            await redis.hincrby('queue_counters', 'active', 1);

            return parsedItem;
        } catch (error) {
            console.error('❌ Error getting next document:', error);
            throw error;
        }
    }

    async getQueueStatus() {
        try {
            // Get all counters
            const counters = await redis.hgetall('queue_counters') || {};
            
            return {
                waiting: parseInt(counters.waiting || '0'),
                active: parseInt(counters.active || '0'),
                completed: parseInt(counters.completed || '0'),
                failed: parseInt(counters.failed || '0'),
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('❌ Error getting queue status:', error);
            throw error;
        }
    }

    async resetCounters() {
        try {
            console.log('🔄 Resetting queue counters...');
            
            await redis.del('queue_counters');
            await redis.hset('queue_counters', {
                waiting: 0,
                active: 0,
                completed: 0,
                failed: 0
            });
            
            console.log('✨ Queue counters reset successfully');
        } catch (error) {
            console.error('❌ Error resetting counters:', error);
            throw error;
        }
    }
}

module.exports = new QueueService();
