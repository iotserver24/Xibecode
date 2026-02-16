import { BackgroundAgentManager } from '../src/core/background-agent.js';
import * as fs from 'fs/promises';
import * as path from 'path';

async function runTest() {
    console.log('Testing Background Agent Manager...');

    const manager = new BackgroundAgentManager();
    await manager.init(); // Ensure dirs exist

    console.log('Starting background task...');
    // We use a simple prompt that should be quick
    const prompt = 'List the files in the current directory and stop.';

    try {
        const taskId = await manager.startTask(prompt);
        console.log(`Task started with ID: ${taskId}`);

        // Give it some time to start up and write logs
        console.log('Waiting for process to initialize...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('Checking active tasks...');
        const tasks = await manager.listTasks();
        const myTask = tasks.find(t => t.id === taskId);

        if (!myTask) {
            console.error('❌ Task not found in list!');
            process.exit(1);
        }
        console.log(`Task status: ${myTask.status}`);
        console.log(`PID: ${myTask.pid}`);

        console.log('Fetching logs...');
        const logs = await manager.getTaskLogs(taskId);
        console.log('--- Logs Start ---');
        console.log(logs);
        console.log('--- Logs End ---');

        if (logs.length > 0) {
            console.log('✅ Logs received.');
        } else {
            console.error('❌ No logs found!');
            // It might take longer to start Node.js
        }

        // Kill the task to clean up
        console.log('Killing task...');
        const killed = await manager.killTask(taskId);
        if (killed) {
            console.log('✅ Task killed successfully.');
        } else {
            console.warn('⚠️ Failed to kill task (might have already finished).');
        }

        // Verify status update
        const tasksAfter = await manager.listTasks();
        const myTaskAfter = tasksAfter.find(t => t.id === taskId);
        console.log(`Final status: ${myTaskAfter?.status}`);

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

runTest();
