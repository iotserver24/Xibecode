import { GitUtils } from '../src/utils/git.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runTest() {
    console.log('Testing Git Attribution...');

    const testDir = path.join(process.cwd(), '.xibecode', 'test-git-attribution');

    // Cleanup previous test
    try {
        await fs.rm(testDir, { recursive: true, force: true });
    } catch { }

    await fs.mkdir(testDir, { recursive: true });

    // Init git repo
    console.log('Initializing git repo in', testDir);
    await execAsync('git init', { cwd: testDir });
    await execAsync('git config user.email "test@example.com"', { cwd: testDir });
    await execAsync('git config user.name "Test User"', { cwd: testDir });

    // Create a file
    const filePath = path.join(testDir, 'hello.ts');
    await fs.writeFile(filePath, 'console.log("Hello AI");\n');

    const gitUtils = new GitUtils(testDir);

    // Add file
    await execAsync('git add hello.ts', { cwd: testDir });

    // Commit with trailer
    console.log('Committing with AI trailer...');
    const result = await gitUtils.commit('Add hello.ts', 'TestBot');

    if (!result.success) {
        console.error('Commit failed:', result.error);
        process.exit(1);
    }

    console.log('Commit hash:', result.hash);

    // Verify log
    const { stdout: log } = await execAsync('git log -1 --pretty=fuller', { cwd: testDir });
    if (log.includes('X-AI-Agent: TestBot')) {
        console.log('✅ Trailer found in git log!');
    } else {
        console.error('❌ Trailer NOT found in git log!');
        console.log(log);
        process.exit(1);
    }

    // Verify blame
    console.log('Verifying blame...');
    // We need to pass relative path to getBlame if we want it to work nicely, 
    // but getBlame uses exact path passed to it in `git blame`.
    // If I pass 'hello.ts', it should work since cwd is testDir.
    const blame = await gitUtils.getBlame('hello.ts');
    console.log('--- Blame Output ---');
    console.log(blame);

    if (blame.includes('(🤖 TestBot)')) {
        console.log('✅ AI attribution found in blame!');
    } else {
        console.error('❌ AI attribution NOT found in blame!');
        process.exit(1);
    }

    console.log('Test passed.');

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
}

runTest();
