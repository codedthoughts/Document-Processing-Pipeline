const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { pipeline, env } = require('@xenova/transformers');

// Define directory paths
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const PROCESSED_DIR = path.join(UPLOAD_DIR, 'processed');
const ORIGINAL_DIR = path.join(UPLOAD_DIR, 'original');
const TEMP_DIR = path.join(UPLOAD_DIR, 'temp');

// Ensure directories exist
[UPLOAD_DIR, PROCESSED_DIR, ORIGINAL_DIR, TEMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
    }
});

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

async function processDocument(filePath, fileType, fileName) {
    let text = '';
    console.log(`\n📄 Processing document: ${fileName}`);
    console.log(`📋 File type: ${fileType}`);

    try {
        // First, move the uploaded file to the original directory
        const originalFilePath = path.join(ORIGINAL_DIR, fileName);
        
        // Check if the file exists in temp or original directory
        if (fs.existsSync(filePath)) {
            console.log(`📦 Moving file from temp to original directory: ${originalFilePath}`);
            fs.copyFileSync(filePath, originalFilePath);
        } else if (!fs.existsSync(originalFilePath)) {
            throw new Error(`File not found in temp or original directory: ${fileName}`);
        } else {
            console.log(`📁 File already exists in original directory: ${originalFilePath}`);
        }
        
        console.log('🔍 Extracting text from document...');
        const startExtract = Date.now();

        // Always read from the original file path
        switch (fileType) {
            case 'application/pdf':
                console.log('📚 Reading PDF content...');
                const dataBuffer = fs.readFileSync(originalFilePath);
                const pdfData = await pdf(dataBuffer);
                text = pdfData.text;
                break;

            case 'text/plain':
                console.log('📝 Reading text file...');
                text = fs.readFileSync(originalFilePath, 'utf8');
                break;

            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                console.log('📘 Reading Word document...');
                const result = await mammoth.extractRawText({ path: originalFilePath });
                text = result.value;
                break;

            case 'image/jpeg':
            case 'image/png':
                console.log('🖼️ Performing OCR on image...');
                const { data: { text: ocrText } } = await Tesseract.recognize(originalFilePath);
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

        // Store processed file
        console.log('\n💾 Storing processed file...');
        const fileUrl = await storeProcessedFile(originalFilePath, fileName);
        console.log('✅ File stored successfully!');

        // Clean up the temporary upload file if it exists
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log('🧹 Cleaned up temporary file');
            } catch (err) {
                console.warn('⚠️ Could not delete temporary upload file:', err);
            }
        }

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

    const importantSentences = sentences
        .map((sentence, index) => ({
            sentence: sentence.trim(),
            score: scoreSentence(sentence, index, sentences.length)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(5, Math.ceil(sentences.length * 0.3)))
        .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence))
        .map(item => item.sentence);

    console.log(`✅ Generated basic summary with ${importantSentences.length} sentences`);
    return importantSentences.join('. ') + '.';
}

function scoreSentence(sentence, index, totalSentences) {
    let score = 0;
    
    if (index < totalSentences * 0.2 || index > totalSentences * 0.8) {
        score += 0.3;
    }

    const words = sentence.split(/\s+/).length;
    if (words > 5 && words < 25) {
        score += 0.3;
    }

    const keywords = ['important', 'significant', 'therefore', 'conclusion', 'summary', 'result', 'key', 'main'];
    score += keywords.filter(keyword => 
        sentence.toLowerCase().includes(keyword)
    ).length * 0.1;

    return score;
}

async function storeProcessedFile(filePath, fileName) {
    const processedFilePath = path.join(PROCESSED_DIR, fileName);

    try {
        fs.copyFileSync(filePath, processedFilePath);
        console.log(`📁 Stored processed file: ${processedFilePath}`);
    } catch (error) {
        console.error('❌ Error storing processed file:', error);
        throw error;
    }

    // Return URL that points to the processed file
    return `/uploads/processed/${fileName}`;
}

module.exports = {
    processDocument
};
