# Use Node.js LTS version
FROM node:18-slim

# Install system dependencies for Tesseract OCR
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Expose port
EXPOSE 8000

# Start command
CMD ["npm", "start"]
