import { SwarmOrchestrator } from '../src/core/swarm.js';
import { BackgroundAgentManager } from '../src/core/background-agent.js';

// Mock
class MockBackgroundAgentManager extends BackgroundAgentManager {
    tasks = new Map();
    logs = new Map();

    constructor() {
        super(process.cwd());
    }

    async startTask(prompt: string): Promise<string> {
        const id = 'task_' + Date.now();
        console.log(`[Mock] Starting task ${id} with prompt: ${prompt.substring(0, 50)}...`);
        this.tasks.set(id, { id, status: 'running' });

        // Simulate completion after delay
        setTimeout(() => {
            const task = this.tasks.get(id);
            if (task) task.status = 'completed';
            this.logs.set(id, 'Task executed.\n[[TASK_COMPLETE | summary=Done]]');
            console.log(`[Mock] Task ${id} completed.`);
        }, 1000);

        return id;
    }

    async getTask(taskId: string): Promise<any> {
        return this.tasks.get(taskId);
    }

    async getTaskLogs(taskId: string): Promise<string> {
        return this.logs.get(taskId) || '';
    }
}

async function runTest() {
    console.log('Testing Swarm Orchestrator (Mocked)...');

    const mockAgent = new MockBackgroundAgentManager();
    const swarm = new SwarmOrchestrator(mockAgent);

    console.log('Delegating task...');
    const result = await swarm.delegateSubtask('agent', 'Do something', 5000);

    if (result.success && result.status === 'completed') {
        console.log('✅ Task completed successfully.');
        if (result.result.includes('[[TASK_COMPLETE')) {
            console.log('✅ Correctly received logs.');
        } else {
            console.error('❌ Missing logs.');
            process.exit(1);
        }
    } else {
        console.error('❌ Task failed:', result);
        process.exit(1);
    }

    console.log('Test passed.');
}

runTest();
