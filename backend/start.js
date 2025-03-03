const { spawn } = require('child_process');
const path = require('path');

// Start main server
const server = spawn('node', ['src/index.js'], {
    stdio: 'inherit'
});

// Start worker process
const worker = spawn('node', ['src/workers/worker.js'], {
    stdio: 'inherit'
});

// Handle process termination
process.on('SIGINT', () => {
    server.kill();
    worker.kill();
    process.exit();
});

server.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    worker.kill();
    process.exit(code);
});

worker.on('close', (code) => {
    console.log(`Worker process exited with code ${code}`);
    server.kill();
    process.exit(code);
});
