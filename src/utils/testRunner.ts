import * as fs from 'fs/promises';
import * as path from 'path';

export interface TestRunnerInfo {
  detected: boolean;
  runner?: string;
  command?: string;
  packageManager?: 'pnpm' | 'bun' | 'npm';
  scriptName?: string;
}

export interface TestResult {
  success: boolean;
  exitCode?: number;
  output: string;
  errors: string;
  duration?: number;
  testsRun?: number;
  testsPassed?: number;
  testsFailed?: number;
}

export class TestRunnerDetector {
  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  /**
   * Detect which package manager is available
   * Priority: pnpm > bun > npm (as per user preference)
   */
  async detectPackageManager(): Promise<'pnpm' | 'bun' | 'npm'> {
    // Check for lock files
    try {
      const files = await fs.readdir(this.workingDir);
      if (files.includes('pnpm-lock.yaml')) return 'pnpm';
      if (files.includes('bun.lockb')) return 'bun';
      if (files.includes('package-lock.json')) return 'npm';
    } catch {
      // Ignore errors
    }

    // Check for installed package managers
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      await execAsync('pnpm --version', { timeout: 2000 });
      return 'pnpm';
    } catch {
      // pnpm not available
    }

    try {
      await execAsync('bun --version', { timeout: 2000 });
      return 'bun';
    } catch {
      // bun not available
    }

    return 'npm'; // Default fallback
  }

  /**
   * Detect test runner and command
   */
  async detectTestRunner(customCommand?: string): Promise<TestRunnerInfo> {
    // If custom command provided, use it
    if (customCommand) {
      return {
        detected: true,
        command: customCommand,
      };
    }

    // Try to read package.json
    try {
      const packageJsonPath = path.join(this.workingDir, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      // Check for test scripts
      const scripts = packageJson.scripts || {};
      
      // Priority: test > test:unit > test:all
      const testScriptName = scripts.test
        ? 'test'
        : scripts['test:unit']
        ? 'test:unit'
        : scripts['test:all']
        ? 'test:all'
        : null;

      if (testScriptName) {
        const packageManager = await this.detectPackageManager();
        return {
          detected: true,
          runner: this.detectRunnerFromDeps(packageJson),
          command: `${packageManager} ${testScriptName === 'test' ? 'test' : `run ${testScriptName}`}`,
          packageManager,
          scriptName: testScriptName,
        };
      }

      // Check for direct runner in dependencies
      const runner = this.detectRunnerFromDeps(packageJson);
      if (runner) {
        const packageManager = await this.detectPackageManager();
        return {
          detected: true,
          runner,
          command: `${packageManager} run ${runner}`,
          packageManager,
        };
      }
    } catch {
      // No package.json or parsing error
    }

    // Check for Python test runners
    try {
      const files = await fs.readdir(this.workingDir);
      
      // pytest
      if (files.some(f => f.includes('pytest') || f === 'pytest.ini')) {
        return {
          detected: true,
          runner: 'pytest',
          command: 'pytest',
        };
      }

      // unittest (Python standard library)
      if (files.some(f => f.startsWith('test_') && f.endsWith('.py'))) {
        return {
          detected: true,
          runner: 'unittest',
          command: 'python -m unittest discover',
        };
      }
    } catch {
      // Ignore
    }

    // Check for Go tests
    try {
      const files = await fs.readdir(this.workingDir);
      if (files.some(f => f.endsWith('_test.go'))) {
        return {
          detected: true,
          runner: 'go test',
          command: 'go test ./...',
        };
      }
    } catch {
      // Ignore
    }

    return { detected: false };
  }

  /**
   * Detect test runner from package.json dependencies
   */
  private detectRunnerFromDeps(packageJson: any): string | undefined {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    if (allDeps.vitest) return 'vitest';
    if (allDeps.jest) return 'jest';
    if (allDeps.mocha) return 'mocha';
    if (allDeps.ava) return 'ava';
    if (allDeps.tape) return 'tape';
    if (allDeps['node:test']) return 'node:test';

    return undefined;
  }

  /**
   * Parse test output to extract statistics
   */
  parseTestOutput(output: string, runner?: string): Partial<TestResult> {
    const result: Partial<TestResult> = {
      testsRun: undefined,
      testsPassed: undefined,
      testsFailed: undefined,
    };

    // Vitest patterns
    if (runner === 'vitest' || output.includes('Test Files') || output.includes('PASS') || output.includes('FAIL')) {
      const passMatch = output.match(/(\d+) passed/);
      const failMatch = output.match(/(\d+) failed/);
      const totalMatch = output.match(/(\d+) test[s]?/);

      if (passMatch) result.testsPassed = parseInt(passMatch[1], 10);
      if (failMatch) result.testsFailed = parseInt(failMatch[1], 10);
      if (totalMatch) result.testsRun = parseInt(totalMatch[1], 10);
    }

    // Jest patterns
    if (runner === 'jest' || output.includes('Tests:')) {
      const passMatch = output.match(/(\d+) passed/);
      const failMatch = output.match(/(\d+) failed/);
      const totalMatch = output.match(/Tests:\s+(\d+) total/);

      if (passMatch) result.testsPassed = parseInt(passMatch[1], 10);
      if (failMatch) result.testsFailed = parseInt(failMatch[1], 10);
      if (totalMatch) result.testsRun = parseInt(totalMatch[1], 10);
    }

    // Mocha patterns
    if (runner === 'mocha' || output.includes('passing') || output.includes('failing')) {
      const passMatch = output.match(/(\d+) passing/);
      const failMatch = output.match(/(\d+) failing/);

      if (passMatch) result.testsPassed = parseInt(passMatch[1], 10);
      if (failMatch) result.testsFailed = parseInt(failMatch[1], 10);
      if (result.testsPassed !== undefined && result.testsFailed !== undefined) {
        result.testsRun = result.testsPassed + result.testsFailed;
      }
    }

    // pytest patterns
    if (runner === 'pytest' || output.includes('pytest')) {
      const match = output.match(/(\d+) passed(?:, (\d+) failed)?/);
      if (match) {
        result.testsPassed = parseInt(match[1], 10);
        result.testsFailed = match[2] ? parseInt(match[2], 10) : 0;
        result.testsRun = result.testsPassed + result.testsFailed;
      }
    }

    // Go test patterns
    if (runner === 'go test' || output.includes('PASS') || output.includes('FAIL')) {
      const passMatch = output.match(/ok\s+.+\s+[\d.]+s/g);
      const failMatch = output.match(/FAIL\s+.+\s+[\d.]+s/g);

      if (passMatch) result.testsPassed = passMatch.length;
      if (failMatch) result.testsFailed = failMatch.length;
      if (result.testsPassed !== undefined || result.testsFailed !== undefined) {
        result.testsRun = (result.testsPassed || 0) + (result.testsFailed || 0);
      }
    }

    return result;
  }

  /**
   * Extract failure details from test output
   */
  extractFailures(output: string): string[] {
    const failures: string[] = [];
    const lines = output.split('\n');

    // Common failure patterns
    const failureIndicators = [
      'FAIL',
      'FAILED',
      'Error:',
      'AssertionError',
      '✗',
      '❌',
      '×',
    ];

    let inFailureBlock = false;
    let currentFailure: string[] = [];

    for (const line of lines) {
      // Check if we're entering a failure block
      if (failureIndicators.some(indicator => line.includes(indicator))) {
        if (currentFailure.length > 0) {
          failures.push(currentFailure.join('\n'));
        }
        currentFailure = [line];
        inFailureBlock = true;
      } else if (inFailureBlock) {
        // Continue collecting failure details
        if (line.trim() === '' || line.match(/^[\s]*at /)) {
          currentFailure.push(line);
        } else if (line.match(/^\s*(PASS|✓|√)/)) {
          // Exit failure block on next passing test
          if (currentFailure.length > 0) {
            failures.push(currentFailure.join('\n'));
            currentFailure = [];
          }
          inFailureBlock = false;
        } else {
          currentFailure.push(line);
        }
      }
    }

    if (currentFailure.length > 0) {
      failures.push(currentFailure.join('\n'));
    }

    return failures.slice(0, 10); // Limit to first 10 failures
  }
}
