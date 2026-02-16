import { VisualFeedbackProvider } from '../src/core/visual-feedback.js';
import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';

// Simple test server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <html>
            <head><title>Visual Feedback Test</title></head>
            <body>
                <h1 id="main-title">Hello World</h1>
                <div class="container">
                    <p>Testing visual feedback capture.</p>
                    <button class="btn-primary">Click Me</button>
                    <div style="display:none">Hidden Element</div>
                </div>
            </body>
        </html>
    `);
});

async function runTest() {
    console.log('Starting test server...');
    const port = 8081;
    await new Promise<void>((resolve) => server.listen(port, resolve));

    const provider = new VisualFeedbackProvider();

    try {
        console.log('Launching browser...');
        await provider.init();

        console.log('Capturing preview...');
        const result = await provider.capture(`http://localhost:${port}`);

        console.log('Result:', result);

        // Assertions
        if (!result.screenshotPath) throw new Error('No screenshot path returned');
        if (!result.domSummary.includes('Hello World')) throw new Error('DOM summary missing content');
        if (result.domSummary.includes('Hidden Element')) throw new Error('DOM summary includes hidden element');

        // Check if file exists
        const stat = await fs.stat(result.screenshotPath);
        if (stat.size === 0) throw new Error('Screenshot file is empty');

        console.log('✅ Visual Feedback Test Passed!');

    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    } finally {
        await provider.cleanup();
        server.close();
    }
}

runTest();
