import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

export interface BackgroundTask {
    id: string;
    pid: number;
    prompt: string;
    startTime: number;
    status: 'running' | 'completed' | 'failed' | 'killed';
    logPath: string;
}

export class BackgroundAgentManager {
    private baseDir: string;
    private processesDir: string;
    private logsDir: string;

    constructor(workingDir: string = process.cwd()) {
        this.baseDir = path.join(workingDir, '.xibecode');
        this.processesDir = path.join(this.baseDir, 'processes');
        this.logsDir = path.join(this.baseDir, 'logs');
    }

    async init(): Promise<void> {
        await fs.mkdir(this.processesDir, { recursive: true });
        await fs.mkdir(this.logsDir, { recursive: true });
    }

    async startTask(prompt: string): Promise<string> {
        await this.init();

        const taskId = createHash('md5').update(prompt + Date.now()).digest('hex').substring(0, 8);
        const logPath = path.join(this.logsDir, `${taskId}.log`);


        // ... (in startTask)
        // Determine the executable command
        const distPath = path.join(this.baseDir, '../dist/index.js');
        let command = 'tsx';
        let scriptPath = path.join(process.cwd(), 'src/index.ts');

        try {
            await fs.access(distPath);
            command = 'node';
            scriptPath = distPath;
        } catch (e) {
            // Fallback to src/index.ts with tsx
        }

        const args = [scriptPath, 'run', prompt, '--non-interactive'];

        // Spawn detached process
        const out = await fs.open(logPath, 'a');
        const err = await fs.open(logPath, 'a');

        const env: NodeJS.ProcessEnv = { ...process.env, BACKGROUND_AGENT_ID: taskId };
        delete env['NODE_OPTIONS']; // Prevent inheritance of loaders that might break child process

        const child = spawn(command, args, {
            detached: true,
            stdio: ['ignore', out.fd, err.fd],
            cwd: process.cwd(),
            env
        });

        child.unref();

        // Save task state
        if (child.pid) {
            const task: BackgroundTask = {
                id: taskId,
                pid: child.pid,
                prompt,
                startTime: Date.now(),
                status: 'running',
                logPath
            };
            await this.saveTask(task);
            return taskId;
        } else {
            throw new Error('Failed to spawn background process');
        }
    }

    async listTasks(): Promise<BackgroundTask[]> {
        await this.init();
        const files = await fs.readdir(this.processesDir);
        const tasks: BackgroundTask[] = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = await fs.readFile(path.join(this.processesDir, file), 'utf-8');
                    const task = JSON.parse(content);

                    // Check if process is still running if status is 'running'
                    if (task.status === 'running') {
                        if (!this.isProcessRunning(task.pid)) {
                            task.status = 'completed'; // Or unknown/failed, but assume done for now
                            await this.saveTask(task);
                        }
                    }
                    tasks.push(task);
                } catch (e) {
                    // Ignore corrupted files
                }
            }
        }
        return tasks.sort((a, b) => b.startTime - a.startTime);
    }

    async getTaskLogs(taskId: string, lines: number = 20): Promise<string> {
        const logPath = path.join(this.logsDir, `${taskId}.log`);
        try {
            const content = await fs.readFile(logPath, 'utf-8');
            const allLines = content.split('\n');
            return allLines.slice(-lines).join('\n');
        } catch (e) {
            return `No logs found for task ${taskId}`;
        }
    }

    async killTask(taskId: string): Promise<boolean> {
        const task = await this.getTask(taskId);
        if (task && task.status === 'running') {
            try {
                process.kill(task.pid);
                task.status = 'killed';
                await this.saveTask(task);
                return true;
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    async getTask(taskId: string): Promise<BackgroundTask | null> {
        const taskPath = path.join(this.processesDir, `${taskId}.json`);
        try {
            const content = await fs.readFile(taskPath, 'utf-8');
            return JSON.parse(content);
        } catch {
            return null;
        }
    }

    private async saveTask(task: BackgroundTask): Promise<void> {
        await fs.writeFile(
            path.join(this.processesDir, `${task.id}.json`),
            JSON.stringify(task, null, 2)
        );
    }

    private isProcessRunning(pid: number): boolean {
        try {
            return process.kill(pid, 0);
        } catch (e) {
            return false;
        }
    }
}
