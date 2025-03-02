# Document Processing Pipeline

A robust document processing system that handles document uploads, OCR processing, text summarization, and search functionality.

## Features
- User authentication with JWT
- Document upload support (PDF, TXT, DOCX)
- Image upload and OCR processing using Tesseract
- Text summarization using BART model
- Keyword search functionality
- Cloud storage integration
- Asynchronous processing queue using Bull and Redis

## Tech Stack
- Backend: Node.js, Express
- Frontend: React
- Database: MongoDB
- Queue System: Bull (Redis-based)
- OCR: Tesseract
- Text Summarization: BART
- Storage: AWS S3
- Authentication: JWT

## Setup Instructions
1. Install dependencies:
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd frontend
   npm install
   ```

2. Configure environment variables:
   Create a `.env` file in the backend directory with:
   ```
   PORT=3000
   MONGODB_URI=your_mongodb_uri
   JWT_SECRET=your_jwt_secret
   REDIS_URL=your_redis_url
   AWS_ACCESS_KEY=your_aws_access_key
   AWS_SECRET_KEY=your_aws_secret_key
   AWS_BUCKET_NAME=your_bucket_name
   ```

3. Start the services:
   ```bash
   # Start Redis
   redis-server

   # Start Backend
   cd backend
   npm start

   # Start Frontend
   cd frontend
   npm start
   ```
