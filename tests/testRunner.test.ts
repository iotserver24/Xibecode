import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestRunnerDetector } from '../src/utils/testRunner.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');
vi.mock('child_process');

describe('TestRunnerDetector', () => {
  let detector: TestRunnerDetector;

  beforeEach(() => {
    detector = new TestRunnerDetector('/test/dir');
    vi.clearAllMocks();
  });

  describe('detectPackageManager', () => {
    it('should detect pnpm from lock file', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['pnpm-lock.yaml', 'package.json'] as any);
      
      const result = await detector.detectPackageManager();
      expect(result).toBe('pnpm');
    });

    it('should detect bun from lock file', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['bun.lockb', 'package.json'] as any);
      
      const result = await detector.detectPackageManager();
      expect(result).toBe('bun');
    });

    it('should detect npm from lock file', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['package-lock.json', 'package.json'] as any);
      
      const result = await detector.detectPackageManager();
      expect(result).toBe('npm');
    });

    it('should default to npm when no lock file found', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['package.json'] as any);
      
      const result = await detector.detectPackageManager();
      expect(result).toBe('npm');
    });
  });

  describe('detectTestRunner', () => {
    it('should use custom command when provided', async () => {
      const result = await detector.detectTestRunner('pytest --verbose');
      
      expect(result.detected).toBe(true);
      expect(result.command).toBe('pytest --verbose');
    });

    it('should detect vitest from package.json', async () => {
      const packageJson = {
        scripts: {
          test: 'vitest',
        },
        devDependencies: {
          vitest: '^1.0.0',
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(packageJson));
      vi.mocked(fs.readdir).mockResolvedValue(['pnpm-lock.yaml'] as any);

      const result = await detector.detectTestRunner();
      
      expect(result.detected).toBe(true);
      expect(result.runner).toBe('vitest');
      expect(result.command).toBe('pnpm test');
      expect(result.packageManager).toBe('pnpm');
    });

    it('should detect jest from package.json', async () => {
      const packageJson = {
        scripts: {
          test: 'jest',
        },
        devDependencies: {
          jest: '^29.0.0',
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(packageJson));
      vi.mocked(fs.readdir).mockResolvedValue(['package-lock.json'] as any);

      const result = await detector.detectTestRunner();
      
      expect(result.detected).toBe(true);
      expect(result.runner).toBe('jest');
      expect(result.command).toBe('npm test');
    });

    it('should detect pytest from file patterns', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('No package.json'));
      vi.mocked(fs.readdir).mockResolvedValue(['pytest.ini', 'test_app.py'] as any);

      const result = await detector.detectTestRunner();
      
      expect(result.detected).toBe(true);
      expect(result.runner).toBe('pytest');
      expect(result.command).toBe('pytest');
    });

    it('should detect Python unittest from file patterns', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('No package.json'));
      vi.mocked(fs.readdir).mockResolvedValue(['test_models.py', 'test_views.py'] as any);

      const result = await detector.detectTestRunner();
      
      expect(result.detected).toBe(true);
      expect(result.runner).toBe('unittest');
      expect(result.command).toBe('python -m unittest discover');
    });

    it('should detect Go tests from file patterns', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('No package.json'));
      vi.mocked(fs.readdir).mockResolvedValue(['main_test.go', 'utils_test.go'] as any);

      const result = await detector.detectTestRunner();
      
      expect(result.detected).toBe(true);
      expect(result.runner).toBe('go test');
      expect(result.command).toBe('go test ./...');
    });

    it('should return not detected when no runner found', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('No package.json'));
      vi.mocked(fs.readdir).mockResolvedValue(['main.js'] as any);

      const result = await detector.detectTestRunner();
      
      expect(result.detected).toBe(false);
    });
  });

  describe('parseTestOutput', () => {
    it('should parse vitest output', () => {
      const output = `
 Test Files  2 passed (2)
      Tests  15 passed (15)
   Start at  14:32:10
   Duration  1.23s
      `;

      const result = detector.parseTestOutput(output, 'vitest');
      
      expect(result.testsPassed).toBe(15);
      expect(result.testsRun).toBe(15);
    });

    it('should parse jest output with failures', () => {
      const output = `
Tests:       3 failed, 12 passed, 15 total
Snapshots:   0 total
Time:        2.5s
      `;

      const result = detector.parseTestOutput(output, 'jest');
      
      expect(result.testsPassed).toBe(12);
      expect(result.testsFailed).toBe(3);
      expect(result.testsRun).toBe(15);
    });

    it('should parse mocha output', () => {
      const output = `
  ✓ should work correctly
  ✓ should handle errors

  18 passing (245ms)
  2 failing
      `;

      const result = detector.parseTestOutput(output, 'mocha');
      
      expect(result.testsPassed).toBe(18);
      expect(result.testsFailed).toBe(2);
      expect(result.testsRun).toBe(20);
    });

    it('should parse pytest output', () => {
      const output = `
====== test session starts ======
collected 25 items

tests/test_app.py ......
tests/test_models.py .........

====== 15 passed in 1.23s ======
      `;

      const result = detector.parseTestOutput(output, 'pytest');
      
      expect(result.testsPassed).toBe(15);
    });
  });

  describe('extractFailures', () => {
    it('should extract failure details', () => {
      const output = `
  ✓ test 1 passes

  FAIL test 2 fails
  Error: Expected true to be false
    at Object.<anonymous> (test.js:10:5)

  ✓ test 3 passes

  FAILED test 4 also fails
  AssertionError: expected 1 to equal 2
    at Context.<anonymous> (test.js:20:10)
      `;

      const failures = detector.extractFailures(output);
      
      expect(failures).toHaveLength(2);
      expect(failures[0]).toContain('FAIL test 2 fails');
      expect(failures[0]).toContain('Expected true to be false');
      expect(failures[1]).toContain('FAILED test 4 also fails');
    });

    it('should limit to 10 failures', () => {
      const output = Array(15)
        .fill(0)
        .map((_, i) => `FAIL test ${i}\nError: test failed`)
        .join('\n\n');

      const failures = detector.extractFailures(output);
      expect(failures.length).toBeLessThanOrEqual(10);
    });
  });
});
