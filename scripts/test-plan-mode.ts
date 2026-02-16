import { CodingToolExecutor } from '../src/core/tools.js';
import * as path from 'path';
import * as fs from 'fs/promises';

async function runTest() {
    console.log('Testing Plan Mode Restrictions...');

    // Setup
    const executor = new CodingToolExecutor(process.cwd(), {
        dryRun: false
    });

    // Switch to PLAN mode
    console.log('Switching to PLAN mode...');
    executor.setMode('plan');

    // Test 1: Write to arbitrary file (Blocked)
    console.log('Test 1: Writing to arbitrary file (Should FAIL)...');
    const result1 = await executor.execute('write_file', {
        path: 'src/test-plan-blocked.ts',
        content: '// This should be blocked'
    });

    if (result1.error && result1.message.includes('PERMISSION DENIED')) {
        console.log('✅ Correctly blocked arbitrary write.');
    } else {
        console.error('❌ Failed to block arbitrary write!', result1);
        process.exit(1);
    }

    // Test 2: Write to implementations.md (Allowed)
    console.log('Test 2: Writing to implementations.md (Should SUCCEED)...');
    // Cleanup first
    try { await fs.unlink('implementations.md'); } catch { }

    const result2 = await executor.execute('write_file', {
        path: 'implementations.md',
        content: '# Implementation Plan\n\nAllowed.'
    });

    if (result2.success) {
        console.log('✅ Correctly allowed implementations.md write.');
        // Cleanup
        await fs.unlink('implementations.md');
    } else {
        console.error('❌ Failed to allow implementations.md write!', result2);
        process.exit(1);
    }

    console.log('Test passed.');
}

runTest();
