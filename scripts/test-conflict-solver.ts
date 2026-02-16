import { ConflictSolver } from '../src/core/conflict-solver.js';
import * as fs from 'fs/promises';
import * as path from 'path';

async function runTest() {
    console.log('Testing Conflict Solver...');

    const testDir = path.join(process.cwd(), '.xibecode', 'test-conflicts');

    // Cleanup
    try { await fs.rm(testDir, { recursive: true, force: true }); } catch { }
    await fs.mkdir(testDir, { recursive: true });

    // Create conflicting file
    const filePath = path.join(testDir, 'conflict.ts');
    const content = `
export function hello() {
<<<<<<< HEAD
    console.log("Hello from HEAD");
=======
    console.log("Hello from FEATURE");
>>>>>>> feature-branch
}
    `.trim();

    await fs.writeFile(filePath, content);

    const solver = new ConflictSolver(testDir);

    // Test 1: Find Files
    console.log('Test 1: Finding conflicting files...');
    const files = await solver.findConflictingFiles();
    console.log('Found files:', files);

    if (files.length === 1 && (files[0] === 'conflict.ts' || files[0].endsWith('conflict.ts'))) {
        console.log('✅ Correctly found conflicting file.');
    } else {
        // grep might return absolute path or relative
        // check if it contains conflict.ts
        if (files.some(f => f.includes('conflict.ts'))) {
            console.log('✅ Correctly found conflicting file (path check).');
        } else {
            console.error('❌ Failed to find conflicting file!');
            process.exit(1);
        }
    }

    // Test 2: Parse Conflicts
    console.log('Test 2: Parsing conflicts...');
    const conflictData = await solver.parseConflicts('conflict.ts');

    if (!conflictData) {
        console.error('❌ Failed to parse conflicts!');
        process.exit(1);
    }

    if (conflictData.conflicts.length === 1) {
        console.log('✅ Correctly found 1 conflict block.');
        const c = conflictData.conflicts[0];
        if (c.ours.includes('HEAD') && c.theirs.includes('FEATURE')) {
            console.log('✅ Correctly parsed ours/theirs content.');
        } else {
            console.error('❌ Content mismatch:', c);
            process.exit(1);
        }
    } else {
        console.error('❌ Wrong number of conflicts:', conflictData.conflicts.length);
        process.exit(1);
    }

    console.log('Test passed.');

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
}

runTest();
