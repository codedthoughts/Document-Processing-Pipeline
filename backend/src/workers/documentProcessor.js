const Tesseract = require('tesseract.js');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { pipeline, env } = require('@xenova/transformers');
const { uploadToS3 } = require('../config/s3');
const { redis } = require('../config/redis');

// Suppress ONNX warnings about unused initializers
env.quiet = true;
env.logger = {
    info: () => {},
    warn: (msg) => {
        if (!msg.includes('Removing initializer')) {
            console.warn(msg);
        }
    },
    error: console.error
};

let summarizationPipeline = null;

async function initializeSummarizer() {
    if (!summarizationPipeline) {
        console.log('\n🚀 Initializing BART summarization model...');
        const startTime = Date.now();
        summarizationPipeline = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
        const initTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ Model initialized in ${initTime} seconds`);
    }
}

async function processDocument(file, userId) {
    let text = '';
    console.log(`\n📄 Processing document: ${file.originalname}`);
    console.log(`📋 File type: ${file.mimetype}`);

    try {
        console.log('🔍 Extracting text from document...');
        const startExtract = Date.now();

        switch (file.mimetype) {
            case 'application/pdf':
                console.log('📚 Reading PDF content...');
                const pdfData = await pdf(file.buffer);
                text = pdfData.text;
                break;

            case 'text/plain':
                console.log('📝 Reading text file...');
                text = file.buffer.toString('utf8');
                break;

            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                console.log('📘 Reading Word document...');
                const result = await mammoth.extractRawText({ buffer: file.buffer });
                text = result.value;
                break;

            case 'image/jpeg':
            case 'image/png':
                console.log('🖼️ Performing OCR on image...');
                const { data: { text: ocrText } } = await Tesseract.recognize(file.buffer);
                text = ocrText;
                break;

            default:
                throw new Error('Unsupported file type');
        }

        const extractTime = ((Date.now() - startExtract) / 1000).toFixed(2);
        console.log(`✅ Text extraction completed in ${extractTime} seconds`);
        console.log(`📊 Extracted text length: ${text.length} characters`);

        // Generate summary using BART
        console.log('\n🤖 Starting text summarization...');
        const summary = await generateBartSummary(text);

        // Upload processed file to S3
        console.log('\n💾 Uploading processed file to S3...');
        const processedKey = `${userId}/processed/${Date.now()}-${file.originalname}`;
        const fileUrl = await uploadToS3(file, processedKey);
        console.log('✅ File uploaded successfully!');

        return {
            text,
            summary,
            fileUrl
        };
    } catch (error) {
        console.error('❌ Processing error:', error);
        throw error;
    }
}

async function generateBartSummary(text) {
    try {
        await initializeSummarizer();

        const maxChunkLength = 512;
        const chunks = splitTextIntoChunks(text, maxChunkLength);
        console.log(`📦 Split text into ${chunks.length} chunks for processing`);
        
        console.log('🔄 Generating summaries for each chunk...');
        const startSummarize = Date.now();
        
        const summaries = await Promise.all(
            chunks.map(async (chunk, index) => {
                process.stdout.write(`\r  ⏳ Processing chunk ${index + 1}/${chunks.length}...`);
                const result = await summarizationPipeline(chunk, {
                    max_length: 150,
                    min_length: 40,
                    do_sample: false
                });
                process.stdout.write(`\r  ✅ Completed chunk ${index + 1}/${chunks.length}    \n`);
                return result[0].summary_text;
            })
        );

        const summarizeTime = ((Date.now() - startSummarize) / 1000).toFixed(2);
        console.log(`\n✨ All chunks summarized in ${summarizeTime} seconds`);

        const finalSummary = summaries.join(' ');
        console.log(`📊 Final summary length: ${finalSummary.length} characters\n`);
        
        return finalSummary;
    } catch (error) {
        console.error('❌ Summarization error:', error);
        console.log('⚠️ Falling back to basic summarization...');
        return generateBasicSummary(text);
    }
}

function splitTextIntoChunks(text, maxLength) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    console.log(`📊 Total sentences: ${sentences.length}`);
    
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
        if ((currentChunk + sentence).length <= maxLength) {
            currentChunk += sentence + '. ';
        } else {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = sentence + '. ';
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

function generateBasicSummary(text) {
    console.log('📝 Using basic summarization method...');
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length <= 5) {
        console.log('📄 Text is short, returning as is');
        return text;
    }

    const scores = sentences.map((sentence, index) => ({
        sentence,
        score: scoreSentence(sentence, index, sentences.length)
    }));

    scores.sort((a, b) => b.score - a.score);
    const topSentences = scores.slice(0, 5).map(s => s.sentence);
    
    console.log(`📊 Generated summary with ${topSentences.length} sentences`);
    return topSentences.join('. ') + '.';
}

function scoreSentence(sentence, index, totalSentences) {
    let score = 0;
    
    // Prefer sentences at the start and end of the document
    if (index < totalSentences * 0.2) score += 3;
    if (index > totalSentences * 0.8) score += 2;
    
    // Prefer longer, more informative sentences
    const words = sentence.split(/\s+/);
    if (words.length > 5 && words.length < 25) score += 2;
    
    // Prefer sentences with important indicators
    const indicators = ['important', 'significant', 'key', 'main', 'crucial', 'essential'];
    if (indicators.some(word => sentence.toLowerCase().includes(word))) score += 2;
    
    return score;
}

module.exports = {
    processDocument
};
