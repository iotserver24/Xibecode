import { CodeGraph } from '../src/core/code-graph.js';
import * as path from 'path';

async function runTest() {
    console.log('Testing CodeGraph...');

    // Use process.cwd() as working dir
    const graph = new CodeGraph(process.cwd());

    console.log('Initializing graph (may take a moment to parse)...');
    const start = Date.now();
    await graph.init();
    console.log(`Initialized in ${Date.now() - start}ms`);

    const query = 'BackgroundAgentManager';
    console.log(`Searching for symbol: ${query}`);

    const results = await graph.findReferences(query);
    console.log('--- Search Results ---');
    console.log(results);

    if (results.includes('Definition: ClassDeclaration BackgroundAgentManager')) {
        console.log('✅ Found definition!');
    } else {
        console.error('❌ Definition not found!');
        process.exit(1);
    }

    if (results.includes('references:') || results.includes('references')) {
        console.log('✅ Found references!');
    } else {
        console.warn('⚠️ No references found (might be unused or script issue).');
    }

    console.log('Test passed.');
}

runTest();
