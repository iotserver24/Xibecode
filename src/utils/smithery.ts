import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

export interface SmitheryServer {
    qualifiedName: string;
    displayName?: string;
    description?: string;
    useCount?: number;
    connectionUrl?: string;
}

export class SmitheryClient {
    /**
     * Search for MCP servers using Smithery CLI
     */
    async search(query: string): Promise<SmitheryServer[]> {
        try {
            // Use --json to get structured output
            const { stdout } = await execAsync(`npx -y @smithery/cli search "${query}" --json`);
            const data = JSON.parse(stdout);
            return Array.isArray(data) ? data : [];
        } catch (error: any) {
            console.error(chalk.red('Failed to search Smithery:'), error.message);
            return [];
        }
    }

    /**
     * Construct the command configuration for running an MCP server via Smithery
     */
    getRunConfig(serverName: string, config: Record<string, any> = {}): { command: string; args: string[] } {
        return {
            command: 'npx',
            args: [
                '-y',
                '@smithery/cli@latest',
                'run',
                serverName,
                '--config',
                JSON.stringify(config) // Config must be passed as a JSON string to the CLI
            ]
        };
    }

    /**
     * Check if Smithery CLI is usable (has node/npx)
     */
    async isAvailable(): Promise<boolean> {
        try {
            await execAsync('npx --version');
            return true;
        } catch {
            return false;
        }
    }
}
