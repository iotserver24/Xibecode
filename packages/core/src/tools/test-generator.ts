/**
 * AI Test Generator
 *
 * Automatically generates test cases for functions, classes, and modules.
 * Supports multiple testing frameworks: Vitest, Jest, Mocha, pytest, Go test.
 *
 * @module tools/test-generator
 * @since 0.4.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { TestRunnerDetector, TestRunnerInfo } from '../utils/testRunner.js';

export interface TestCase {
  name: string;
  description: string;
  type: 'unit' | 'integration' | 'edge' | 'boundary' | 'error';
  input?: any;
  expectedOutput?: any;
  assertion?: string;
}

export interface FunctionAnalysis {
  name: string;
  params: Array<{ name: string; type?: string; optional?: boolean }>;
  returnType?: string;
  isAsync: boolean;
  isExported: boolean;
  complexity: 'low' | 'medium' | 'high';
  dependencies: string[];
  sideEffects: string[];
}

export interface ClassAnalysis {
  name: string;
  methods: FunctionAnalysis[];
  properties: Array<{ name: string; type?: string; visibility: 'public' | 'private' | 'protected' }>;
  constructorMethod?: FunctionAnalysis;
  isExported: boolean;
}

export interface ModuleAnalysis {
  filePath: string;
  language: 'typescript' | 'javascript' | 'python' | 'go';
  functions: FunctionAnalysis[];
  classes: ClassAnalysis[];
  exports: string[];
  imports: Array<{ module: string; imports: string[] }>;
}

export interface GeneratedTest {
  testFilePath: string;
  framework: string;
  content: string;
  testCases: TestCase[];
  coverage: {
    functions: number;
    branches: number;
    lines: number;
  };
}

export interface TestGeneratorConfig {
  framework?: 'vitest' | 'jest' | 'mocha' | 'pytest' | 'go';
  outputDir?: string;
  includeEdgeCases?: boolean;
  includeMocks?: boolean;
  includeTypeChecks?: boolean;
  maxTestsPerFunction?: number;
  style?: 'describe-it' | 'test' | 'flat';
}

/**
 * AI-powered test generator that analyzes code and generates comprehensive test suites
 */
export class TestGenerator {
  private workingDir: string;
  private testDetector: TestRunnerDetector;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
    this.testDetector = new TestRunnerDetector(workingDir);
  }

  /**
   * Analyze a source file to extract testable components
   */
  async analyzeFile(filePath: string): Promise<ModuleAnalysis> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.workingDir, filePath);

    const content = await fs.readFile(absolutePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    let language: ModuleAnalysis['language'];
    switch (ext) {
      case '.ts':
      case '.tsx':
        language = 'typescript';
        break;
      case '.js':
      case '.jsx':
      case '.mjs':
        language = 'javascript';
        break;
      case '.py':
        language = 'python';
        break;
      case '.go':
        language = 'go';
        break;
      default:
        language = 'javascript';
    }

    const analysis: ModuleAnalysis = {
      filePath: absolutePath,
      language,
      functions: [],
      classes: [],
      exports: [],
      imports: [],
    };

    if (language === 'typescript' || language === 'javascript') {
      this.analyzeJSTS(content, analysis);
    } else if (language === 'python') {
      this.analyzePython(content, analysis);
    } else if (language === 'go') {
      this.analyzeGo(content, analysis);
    }

    return analysis;
  }

  /**
   * Analyze JavaScript/TypeScript code
   */
  private analyzeJSTS(content: string, analysis: ModuleAnalysis): void {
    // Extract imports
    const importRegex = /import\s+(?:(?:\{([^}]+)\})|(?:(\w+)))\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const namedImports = match[1] ? match[1].split(',').map(i => i.trim().split(' as ')[0]) : [];
      const defaultImport = match[2] ? [match[2]] : [];
      analysis.imports.push({
        module: match[3],
        imports: [...namedImports, ...defaultImport],
      });
    }

    // Extract exports
    const exportRegex = /export\s+(?:default\s+)?(?:(?:const|let|var|function|class|async\s+function)\s+)?(\w+)/g;
    while ((match = exportRegex.exec(content)) !== null) {
      if (match[1] && !analysis.exports.includes(match[1])) {
        analysis.exports.push(match[1]);
      }
    }

    // Extract functions
    const funcPatterns = [
      // Regular functions
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g,
      // Arrow functions assigned to const/let
      /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>/g,
      // Method definitions in objects/classes
      /(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g,
    ];

    for (const pattern of funcPatterns) {
      while ((match = pattern.exec(content)) !== null) {
        const funcName = match[1];
        const paramsStr = match[2] || '';
        const returnType = match[3]?.trim();

        // Skip constructors and common non-function matches
        if (['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(funcName)) {
          continue;
        }

        // Check if already added
        if (analysis.functions.some(f => f.name === funcName)) {
          continue;
        }

        const params = this.parseJSTSParams(paramsStr);
        const isAsync = content.substring(Math.max(0, match.index - 20), match.index).includes('async');
        const isExported = analysis.exports.includes(funcName);

        // Estimate complexity based on function body
        const funcBodyMatch = content.substring(match.index).match(/\{([\s\S]*?)\}/);
        const funcBody = funcBodyMatch ? funcBodyMatch[1] : '';
        const complexity = this.estimateComplexity(funcBody);

        // Detect dependencies
        const dependencies = this.detectDependencies(funcBody, analysis.imports);

        // Detect side effects
        const sideEffects = this.detectSideEffects(funcBody);

        analysis.functions.push({
          name: funcName,
          params,
          returnType,
          isAsync,
          isExported,
          complexity,
          dependencies,
          sideEffects,
        });
      }
    }

    // Extract classes
    const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const classBody = this.extractClassBody(content, match.index);

      const classAnalysis: ClassAnalysis = {
        name: className,
        methods: [],
        properties: [],
        isExported: analysis.exports.includes(className),
      };

      // Extract methods from class body
      const methodRegex = /(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g;
      let methodMatch;
      while ((methodMatch = methodRegex.exec(classBody)) !== null) {
        const methodName = methodMatch[1];
        if (methodName === 'constructor') {
          classAnalysis.constructorMethod = {
            name: 'constructor',
            params: this.parseJSTSParams(methodMatch[2] || ''),
            isAsync: false,
            isExported: false,
            complexity: 'low',
            dependencies: [],
            sideEffects: [],
          };
        } else {
          classAnalysis.methods.push({
            name: methodName,
            params: this.parseJSTSParams(methodMatch[2] || ''),
            returnType: methodMatch[3]?.trim(),
            isAsync: classBody.substring(Math.max(0, methodMatch.index - 10), methodMatch.index).includes('async'),
            isExported: false,
            complexity: 'medium',
            dependencies: [],
            sideEffects: [],
          });
        }
      }

      // Extract properties
      const propRegex = /(?:(?:public|private|protected)\s+)?(?:readonly\s+)?(\w+)(?:\s*:\s*([^;=]+))?(?:\s*=)?/g;
      let propMatch;
      while ((propMatch = propRegex.exec(classBody)) !== null) {
        const propName = propMatch[1];
        if (!['constructor', 'static', 'async', 'get', 'set'].includes(propName)) {
          const visibility = classBody.substring(Math.max(0, propMatch.index - 20), propMatch.index);
          classAnalysis.properties.push({
            name: propName,
            type: propMatch[2]?.trim(),
            visibility: visibility.includes('private') ? 'private'
              : visibility.includes('protected') ? 'protected'
              : 'public',
          });
        }
      }

      analysis.classes.push(classAnalysis);
    }
  }

  /**
   * Analyze Python code
   */
  private analyzePython(content: string, analysis: ModuleAnalysis): void {
    // Extract imports
    const importRegex = /(?:from\s+([\w.]+)\s+import\s+([^#\n]+)|import\s+([\w.]+))/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        analysis.imports.push({
          module: match[1],
          imports: match[2].split(',').map(i => i.trim().split(' as ')[0]),
        });
      } else if (match[3]) {
        analysis.imports.push({
          module: match[3],
          imports: [match[3].split('.').pop()!],
        });
      }
    }

    // Extract functions
    const funcRegex = /(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?\s*:/g;
    while ((match = funcRegex.exec(content)) !== null) {
      const funcName = match[1];
      if (funcName.startsWith('_') && !funcName.startsWith('__')) {
        continue; // Skip private functions
      }

      const paramsStr = match[2] || '';
      const params = this.parsePythonParams(paramsStr);
      const isAsync = content.substring(Math.max(0, match.index - 10), match.index).includes('async');

      analysis.functions.push({
        name: funcName,
        params,
        returnType: match[3]?.trim(),
        isAsync,
        isExported: !funcName.startsWith('_'),
        complexity: 'medium',
        dependencies: [],
        sideEffects: [],
      });
    }

    // Extract classes
    const classRegex = /class\s+(\w+)(?:\s*\(([^)]*)\))?\s*:/g;
    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];

      analysis.classes.push({
        name: className,
        methods: [],
        properties: [],
        isExported: !className.startsWith('_'),
      });
    }
  }

  /**
   * Analyze Go code
   */
  private analyzeGo(content: string, analysis: ModuleAnalysis): void {
    // Extract imports
    const importRegex = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"([^"]+)")/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        const imports = match[1].split('\n')
          .map(line => line.trim().replace(/^"([^"]+)"$/, '$1'))
          .filter(Boolean);
        imports.forEach(imp => {
          analysis.imports.push({
            module: imp,
            imports: [imp.split('/').pop()!],
          });
        });
      } else if (match[2]) {
        analysis.imports.push({
          module: match[2],
          imports: [match[2].split('/').pop()!],
        });
      }
    }

    // Extract functions
    const funcRegex = /func\s+(?:\((\w+)\s+\*?(\w+)\)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*\(?([^{]+)\)?)?\s*\{/g;
    while ((match = funcRegex.exec(content)) !== null) {
      const funcName = match[3];
      const receiver = match[2];
      const paramsStr = match[4] || '';
      const returnType = match[5]?.trim();

      const isExported = funcName[0] === funcName[0].toUpperCase();

      analysis.functions.push({
        name: receiver ? `${receiver}.${funcName}` : funcName,
        params: this.parseGoParams(paramsStr),
        returnType,
        isAsync: false,
        isExported,
        complexity: 'medium',
        dependencies: [],
        sideEffects: [],
      });
    }

    // Extract structs (as classes)
    const structRegex = /type\s+(\w+)\s+struct\s*\{/g;
    while ((match = structRegex.exec(content)) !== null) {
      analysis.classes.push({
        name: match[1],
        methods: [],
        properties: [],
        isExported: match[1][0] === match[1][0].toUpperCase(),
      });
    }
  }

  /**
   * Generate test cases for analyzed code
   */
  async generateTests(
    analysis: ModuleAnalysis,
    config: TestGeneratorConfig = {}
  ): Promise<GeneratedTest> {
    const {
      framework = await this.detectFramework(analysis.language),
      outputDir,
      includeEdgeCases = true,
      includeMocks = true,
      maxTestsPerFunction = 5,
      style = 'describe-it',
    } = config;

    const testCases: TestCase[] = [];

    // Generate tests for each function
    for (const func of analysis.functions) {
      if (!func.isExported) continue;

      const funcTests = this.generateFunctionTests(func, {
        includeEdgeCases,
        maxTests: maxTestsPerFunction,
      });
      testCases.push(...funcTests);
    }

    // Generate tests for each class
    for (const cls of analysis.classes) {
      if (!cls.isExported) continue;

      const classTests = this.generateClassTests(cls, {
        includeEdgeCases,
        maxTests: maxTestsPerFunction,
      });
      testCases.push(...classTests);
    }

    // Generate test file content
    const testContent = this.generateTestFileContent(
      analysis,
      testCases,
      framework,
      style,
      includeMocks
    );

    // Determine output path
    const sourceFileName = path.basename(analysis.filePath);
    const ext = path.extname(sourceFileName);
    const baseName = sourceFileName.replace(ext, '');

    let testFileName: string;
    let testDir: string;

    switch (analysis.language) {
      case 'python':
        testFileName = `test_${baseName}.py`;
        testDir = outputDir || path.join(path.dirname(analysis.filePath), 'tests');
        break;
      case 'go':
        testFileName = `${baseName}_test.go`;
        testDir = outputDir || path.dirname(analysis.filePath);
        break;
      default:
        testFileName = `${baseName}.test${ext}`;
        testDir = outputDir || path.join(path.dirname(analysis.filePath), '__tests__');
    }

    const testFilePath = path.join(testDir, testFileName);

    return {
      testFilePath,
      framework,
      content: testContent,
      testCases,
      coverage: {
        functions: analysis.functions.filter(f => f.isExported).length,
        branches: Math.round(testCases.length * 0.8),
        lines: Math.round(testCases.length * 10),
      },
    };
  }

  /**
   * Generate test cases for a function
   */
  private generateFunctionTests(
    func: FunctionAnalysis,
    options: { includeEdgeCases: boolean; maxTests: number }
  ): TestCase[] {
    const tests: TestCase[] = [];

    // Basic functionality test
    tests.push({
      name: `should execute ${func.name} successfully`,
      description: `Test basic functionality of ${func.name}`,
      type: 'unit',
      assertion: `expect(${func.name}(${this.generateDefaultArgs(func.params)})).toBeDefined()`,
    });

    // Return type test
    if (func.returnType) {
      tests.push({
        name: `should return correct type from ${func.name}`,
        description: `Test return type of ${func.name}`,
        type: 'unit',
        assertion: this.generateTypeAssertion(func.name, func.returnType, func.params),
      });
    }

    // Async test
    if (func.isAsync) {
      tests.push({
        name: `should resolve ${func.name} promise`,
        description: `Test async behavior of ${func.name}`,
        type: 'unit',
        assertion: `await expect(${func.name}(${this.generateDefaultArgs(func.params)})).resolves.toBeDefined()`,
      });
    }

    if (options.includeEdgeCases) {
      // Edge case tests for each parameter
      for (const param of func.params) {
        const edgeCases = this.generateEdgeCases(param);
        for (const edgeCase of edgeCases.slice(0, 2)) {
          tests.push({
            name: `should handle ${edgeCase.name} for ${param.name}`,
            description: `Edge case test: ${edgeCase.description}`,
            type: 'edge',
            input: edgeCase.value,
            assertion: edgeCase.assertion,
          });
        }
      }

      // Error handling test
      tests.push({
        name: `should handle errors in ${func.name}`,
        description: `Test error handling`,
        type: 'error',
        assertion: func.isAsync
          ? `await expect(${func.name}(${this.generateInvalidArgs(func.params)})).rejects.toThrow()`
          : `expect(() => ${func.name}(${this.generateInvalidArgs(func.params)})).toThrow()`,
      });
    }

    return tests.slice(0, options.maxTests);
  }

  /**
   * Generate test cases for a class
   */
  private generateClassTests(
    cls: ClassAnalysis,
    options: { includeEdgeCases: boolean; maxTests: number }
  ): TestCase[] {
    const tests: TestCase[] = [];

    // Constructor test
    if (cls.constructorMethod) {
      tests.push({
        name: `should create ${cls.name} instance`,
        description: `Test ${cls.name} constructor`,
        type: 'unit',
        assertion: `const instance = new ${cls.name}(${this.generateDefaultArgs(cls.constructorMethod.params)}); expect(instance).toBeInstanceOf(${cls.name})`,
      });
    }

    // Method tests
    for (const method of cls.methods) {
      tests.push({
        name: `${cls.name}.${method.name} should work correctly`,
        description: `Test ${method.name} method of ${cls.name}`,
        type: 'unit',
        assertion: method.isAsync
          ? `await expect(instance.${method.name}(${this.generateDefaultArgs(method.params)})).resolves.toBeDefined()`
          : `expect(instance.${method.name}(${this.generateDefaultArgs(method.params)})).toBeDefined()`,
      });
    }

    // Property tests
    for (const prop of cls.properties.filter(p => p.visibility === 'public')) {
      tests.push({
        name: `${cls.name}.${prop.name} should be accessible`,
        description: `Test ${prop.name} property of ${cls.name}`,
        type: 'unit',
        assertion: `expect(instance.${prop.name}).toBeDefined()`,
      });
    }

    return tests.slice(0, options.maxTests);
  }

  /**
   * Generate test file content based on framework
   */
  private generateTestFileContent(
    analysis: ModuleAnalysis,
    testCases: TestCase[],
    framework: string,
    style: 'describe-it' | 'test' | 'flat',
    includeMocks: boolean
  ): string {
    const lines: string[] = [];
    const relativePath = this.getRelativeImportPath(analysis.filePath);

    switch (framework) {
      case 'vitest':
        return this.generateVitestContent(analysis, testCases, relativePath, style, includeMocks);
      case 'jest':
        return this.generateJestContent(analysis, testCases, relativePath, style, includeMocks);
      case 'mocha':
        return this.generateMochaContent(analysis, testCases, relativePath, style, includeMocks);
      case 'pytest':
        return this.generatePytestContent(analysis, testCases, relativePath, includeMocks);
      case 'go':
        return this.generateGoTestContent(analysis, testCases, includeMocks);
      default:
        return this.generateVitestContent(analysis, testCases, relativePath, style, includeMocks);
    }
  }

  /**
   * Generate Vitest test content
   */
  private generateVitestContent(
    analysis: ModuleAnalysis,
    testCases: TestCase[],
    relativePath: string,
    style: 'describe-it' | 'test' | 'flat',
    includeMocks: boolean
  ): string {
    const lines: string[] = [];

    // Imports
    lines.push(`import { describe, it, expect, beforeEach, afterEach${includeMocks ? ', vi' : ''} } from 'vitest';`);

    const exports = analysis.exports.filter(e =>
      analysis.functions.some(f => f.name === e) ||
      analysis.classes.some(c => c.name === e)
    );

    if (exports.length > 0) {
      lines.push(`import { ${exports.join(', ')} } from '${relativePath}';`);
    }

    lines.push('');

    if (includeMocks) {
      lines.push('// Mock setup');
      lines.push('beforeEach(() => {');
      lines.push('  vi.clearAllMocks();');
      lines.push('});');
      lines.push('');
    }

    // Group tests by function/class
    const groupedTests = this.groupTestCases(testCases, analysis);

    for (const [groupName, tests] of Object.entries(groupedTests)) {
      if (style === 'describe-it') {
        lines.push(`describe('${groupName}', () => {`);
        for (const test of tests) {
          const asyncPrefix = test.assertion?.includes('await') ? 'async ' : '';
          lines.push(`  it('${test.name}', ${asyncPrefix}() => {`);
          if (test.assertion) {
            lines.push(`    ${test.assertion};`);
          }
          lines.push('  });');
          lines.push('');
        }
        lines.push('});');
        lines.push('');
      } else {
        for (const test of tests) {
          const asyncPrefix = test.assertion?.includes('await') ? 'async ' : '';
          lines.push(`test('${groupName}: ${test.name}', ${asyncPrefix}() => {`);
          if (test.assertion) {
            lines.push(`  ${test.assertion};`);
          }
          lines.push('});');
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate Jest test content
   */
  private generateJestContent(
    analysis: ModuleAnalysis,
    testCases: TestCase[],
    relativePath: string,
    style: 'describe-it' | 'test' | 'flat',
    includeMocks: boolean
  ): string {
    const lines: string[] = [];

    const exports = analysis.exports.filter(e =>
      analysis.functions.some(f => f.name === e) ||
      analysis.classes.some(c => c.name === e)
    );

    if (exports.length > 0) {
      lines.push(`const { ${exports.join(', ')} } = require('${relativePath}');`);
    }

    lines.push('');

    if (includeMocks) {
      lines.push('// Mock setup');
      lines.push('beforeEach(() => {');
      lines.push('  jest.clearAllMocks();');
      lines.push('});');
      lines.push('');
    }

    const groupedTests = this.groupTestCases(testCases, analysis);

    for (const [groupName, tests] of Object.entries(groupedTests)) {
      lines.push(`describe('${groupName}', () => {`);
      for (const test of tests) {
        const asyncPrefix = test.assertion?.includes('await') ? 'async ' : '';
        lines.push(`  ${style === 'test' ? 'test' : 'it'}('${test.name}', ${asyncPrefix}() => {`);
        if (test.assertion) {
          lines.push(`    ${test.assertion};`);
        }
        lines.push('  });');
        lines.push('');
      }
      lines.push('});');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate Mocha test content
   */
  private generateMochaContent(
    analysis: ModuleAnalysis,
    testCases: TestCase[],
    relativePath: string,
    style: 'describe-it' | 'test' | 'flat',
    includeMocks: boolean
  ): string {
    const lines: string[] = [];

    lines.push(`const { expect } = require('chai');`);
    if (includeMocks) {
      lines.push(`const sinon = require('sinon');`);
    }

    const exports = analysis.exports.filter(e =>
      analysis.functions.some(f => f.name === e) ||
      analysis.classes.some(c => c.name === e)
    );

    if (exports.length > 0) {
      lines.push(`const { ${exports.join(', ')} } = require('${relativePath}');`);
    }

    lines.push('');

    if (includeMocks) {
      lines.push('beforeEach(() => {');
      lines.push('  sinon.restore();');
      lines.push('});');
      lines.push('');
    }

    const groupedTests = this.groupTestCases(testCases, analysis);

    for (const [groupName, tests] of Object.entries(groupedTests)) {
      lines.push(`describe('${groupName}', () => {`);
      for (const test of tests) {
        const asyncPrefix = test.assertion?.includes('await') ? 'async ' : '';
        lines.push(`  it('${test.name}', ${asyncPrefix}() => {`);
        if (test.assertion) {
          // Convert Jest-style to Chai-style assertions
          const chaiAssertion = test.assertion
            .replace(/expect\(([^)]+)\)\.toBeDefined\(\)/g, 'expect($1).to.exist')
            .replace(/expect\(([^)]+)\)\.toBeInstanceOf\(([^)]+)\)/g, 'expect($1).to.be.instanceOf($2)')
            .replace(/\.toThrow\(\)/g, '.to.throw()');
          lines.push(`    ${chaiAssertion};`);
        }
        lines.push('  });');
        lines.push('');
      }
      lines.push('});');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate pytest test content
   */
  private generatePytestContent(
    analysis: ModuleAnalysis,
    testCases: TestCase[],
    relativePath: string,
    includeMocks: boolean
  ): string {
    const lines: string[] = [];

    lines.push('import pytest');
    if (includeMocks) {
      lines.push('from unittest.mock import Mock, patch, MagicMock');
    }

    // Convert relative path to Python import
    const moduleName = relativePath.replace(/\//g, '.').replace(/\.py$/, '');
    const exports = analysis.exports.filter(e =>
      analysis.functions.some(f => f.name === e) ||
      analysis.classes.some(c => c.name === e)
    );

    if (exports.length > 0) {
      lines.push(`from ${moduleName} import ${exports.join(', ')}`);
    }

    lines.push('');
    lines.push('');

    const groupedTests = this.groupTestCases(testCases, analysis);

    for (const [groupName, tests] of Object.entries(groupedTests)) {
      lines.push(`class Test${groupName.replace(/\W/g, '')}:`);
      lines.push(`    """Tests for ${groupName}"""`);
      lines.push('');

      for (const test of tests) {
        const funcName = `test_${test.name.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '')}`;
        const asyncPrefix = test.assertion?.includes('await') ? 'async ' : '';
        lines.push(`    ${asyncPrefix}def ${funcName}(self):`);
        lines.push(`        """${test.description}"""`);
        if (test.assertion) {
          // Convert to pytest assertions
          const pytestAssertion = this.convertToPytestAssertion(test.assertion, groupName);
          lines.push(`        ${pytestAssertion}`);
        } else {
          lines.push('        pass');
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate Go test content
   */
  private generateGoTestContent(
    analysis: ModuleAnalysis,
    testCases: TestCase[],
    includeMocks: boolean
  ): string {
    const lines: string[] = [];

    // Get package name from file
    const packageName = path.basename(path.dirname(analysis.filePath));

    lines.push(`package ${packageName}`);
    lines.push('');
    lines.push('import (');
    lines.push('    "testing"');
    if (includeMocks) {
      lines.push('    "github.com/stretchr/testify/assert"');
      lines.push('    "github.com/stretchr/testify/mock"');
    }
    lines.push(')');
    lines.push('');

    const groupedTests = this.groupTestCases(testCases, analysis);

    for (const [groupName, tests] of Object.entries(groupedTests)) {
      for (const test of tests) {
        const funcName = `Test${groupName.replace(/\W/g, '')}_${test.name.replace(/\s+/g, '_').replace(/[^\w]/g, '')}`;
        lines.push(`func ${funcName}(t *testing.T) {`);
        lines.push(`    // ${test.description}`);
        if (includeMocks) {
          lines.push(`    // Add test implementation`);
          lines.push(`    assert.NotNil(t, nil) // TODO: Implement test`);
        } else {
          lines.push(`    // TODO: Implement test`);
        }
        lines.push('}');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // Helper methods

  private parseJSTSParams(paramsStr: string): FunctionAnalysis['params'] {
    if (!paramsStr.trim()) return [];

    return paramsStr.split(',').map(param => {
      const [nameWithType, ...rest] = param.trim().split(':');
      const name = nameWithType.replace('?', '').trim();
      const type = rest.join(':').trim() || undefined;
      const optional = nameWithType.includes('?') || param.includes('=');
      return { name, type, optional };
    }).filter(p => p.name && !p.name.startsWith('...'));
  }

  private parsePythonParams(paramsStr: string): FunctionAnalysis['params'] {
    if (!paramsStr.trim()) return [];

    return paramsStr.split(',').map(param => {
      const [nameWithDefault, typeAnnotation] = param.split(':');
      const name = nameWithDefault.split('=')[0].trim();
      const type = typeAnnotation?.split('=')[0].trim();
      const optional = param.includes('=') || param.includes('None');
      return { name, type, optional };
    }).filter(p => p.name && p.name !== 'self' && p.name !== 'cls' && !p.name.startsWith('*'));
  }

  private parseGoParams(paramsStr: string): FunctionAnalysis['params'] {
    if (!paramsStr.trim()) return [];

    const params: FunctionAnalysis['params'] = [];
    const parts = paramsStr.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      const match = trimmed.match(/(\w+)\s+(\S+)/);
      if (match) {
        params.push({
          name: match[1],
          type: match[2],
          optional: false,
        });
      }
    }

    return params;
  }

  private extractClassBody(content: string, startIndex: number): string {
    let braceCount = 0;
    let started = false;
    let endIndex = startIndex;

    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') {
        braceCount++;
        started = true;
      } else if (content[i] === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          endIndex = i;
          break;
        }
      }
    }

    return content.substring(startIndex, endIndex + 1);
  }

  private estimateComplexity(funcBody: string): 'low' | 'medium' | 'high' {
    const controlStructures = (funcBody.match(/\b(if|else|for|while|switch|catch|try)\b/g) || []).length;
    const nestedBlocks = (funcBody.match(/\{[^{}]*\{/g) || []).length;

    if (controlStructures > 5 || nestedBlocks > 3) return 'high';
    if (controlStructures > 2 || nestedBlocks > 1) return 'medium';
    return 'low';
  }

  private detectDependencies(funcBody: string, imports: ModuleAnalysis['imports']): string[] {
    const deps: string[] = [];
    for (const imp of imports) {
      for (const name of imp.imports) {
        if (funcBody.includes(name)) {
          deps.push(name);
        }
      }
    }
    return deps;
  }

  private detectSideEffects(funcBody: string): string[] {
    const effects: string[] = [];

    if (/console\.(log|warn|error|info)/.test(funcBody)) effects.push('console');
    if (/fs\.(write|append|unlink|mkdir|rm)/.test(funcBody)) effects.push('filesystem');
    if (/fetch|axios|http\./.test(funcBody)) effects.push('network');
    if (/\bprocess\./.test(funcBody)) effects.push('process');
    if (/\bglobal\b|\bwindow\b/.test(funcBody)) effects.push('global');

    return effects;
  }

  private async detectFramework(language: ModuleAnalysis['language']): Promise<string> {
    if (language === 'python') return 'pytest';
    if (language === 'go') return 'go';

    const testInfo = await this.testDetector.detectTestRunner();
    return testInfo.runner || 'vitest';
  }

  private getRelativeImportPath(filePath: string): string {
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    return `../${baseName}`;
  }

  private groupTestCases(
    testCases: TestCase[],
    analysis: ModuleAnalysis
  ): Record<string, TestCase[]> {
    const groups: Record<string, TestCase[]> = {};

    for (const test of testCases) {
      // Extract function/class name from test name
      const match = test.name.match(/(\w+)/);
      const groupName = match ? match[1] : 'General';

      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(test);
    }

    return groups;
  }

  private generateDefaultArgs(params: FunctionAnalysis['params']): string {
    return params.map(p => {
      if (p.type?.includes('string')) return "''";
      if (p.type?.includes('number') || p.type?.includes('int')) return '0';
      if (p.type?.includes('boolean') || p.type?.includes('bool')) return 'false';
      if (p.type?.includes('[]') || p.type?.includes('Array')) return '[]';
      if (p.type?.includes('object') || p.type?.includes('Record')) return '{}';
      if (p.optional) return 'undefined';
      return 'null';
    }).join(', ');
  }

  private generateInvalidArgs(params: FunctionAnalysis['params']): string {
    if (params.length === 0) return 'null';
    return params.map(() => 'undefined').join(', ');
  }

  private generateTypeAssertion(
    funcName: string,
    returnType: string,
    params: FunctionAnalysis['params']
  ): string {
    const args = this.generateDefaultArgs(params);

    if (returnType.includes('string')) {
      return `expect(typeof ${funcName}(${args})).toBe('string')`;
    }
    if (returnType.includes('number')) {
      return `expect(typeof ${funcName}(${args})).toBe('number')`;
    }
    if (returnType.includes('boolean')) {
      return `expect(typeof ${funcName}(${args})).toBe('boolean')`;
    }
    if (returnType.includes('[]') || returnType.includes('Array')) {
      return `expect(Array.isArray(${funcName}(${args}))).toBe(true)`;
    }
    if (returnType.includes('Promise')) {
      return `expect(${funcName}(${args})).toBeInstanceOf(Promise)`;
    }

    return `expect(${funcName}(${args})).toBeDefined()`;
  }

  private generateEdgeCases(param: FunctionAnalysis['params'][0]): Array<{
    name: string;
    description: string;
    value: any;
    assertion: string;
  }> {
    const edgeCases: Array<{ name: string; description: string; value: any; assertion: string }> = [];

    if (param.type?.includes('string')) {
      edgeCases.push(
        { name: 'empty string', description: 'Empty string input', value: "''", assertion: 'expect(result).toBeDefined()' },
        { name: 'whitespace', description: 'Whitespace only input', value: "'   '", assertion: 'expect(result).toBeDefined()' },
        { name: 'special chars', description: 'Special characters', value: "'<>&\"'", assertion: 'expect(result).toBeDefined()' },
      );
    }

    if (param.type?.includes('number') || param.type?.includes('int')) {
      edgeCases.push(
        { name: 'zero', description: 'Zero value', value: '0', assertion: 'expect(result).toBeDefined()' },
        { name: 'negative', description: 'Negative number', value: '-1', assertion: 'expect(result).toBeDefined()' },
        { name: 'large number', description: 'Large number', value: 'Number.MAX_SAFE_INTEGER', assertion: 'expect(result).toBeDefined()' },
      );
    }

    if (param.type?.includes('[]') || param.type?.includes('Array')) {
      edgeCases.push(
        { name: 'empty array', description: 'Empty array', value: '[]', assertion: 'expect(result).toBeDefined()' },
        { name: 'single element', description: 'Single element array', value: '[1]', assertion: 'expect(result).toBeDefined()' },
      );
    }

    if (param.optional) {
      edgeCases.push(
        { name: 'undefined', description: 'Undefined optional param', value: 'undefined', assertion: 'expect(result).toBeDefined()' },
        { name: 'null', description: 'Null optional param', value: 'null', assertion: 'expect(result).toBeDefined()' },
      );
    }

    return edgeCases;
  }

  private convertToPytestAssertion(assertion: string, funcName: string): string {
    return assertion
      .replace(/expect\(([^)]+)\)\.toBeDefined\(\)/g, 'assert $1 is not None')
      .replace(/expect\(([^)]+)\)\.toBeInstanceOf\(([^)]+)\)/g, 'assert isinstance($1, $2)')
      .replace(/expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, 'assert $1 == $2')
      .replace(/expect\(([^)]+)\)\.toEqual\(([^)]+)\)/g, 'assert $1 == $2')
      .replace(/\.toThrow\(\)/g, '')
      .replace(/expect\(\(\) => ([^)]+)\)/g, 'with pytest.raises(Exception): $1');
  }
}

/**
 * Write generated tests to file
 */
export async function writeTestFile(generatedTest: GeneratedTest): Promise<void> {
  const dir = path.dirname(generatedTest.testFilePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(generatedTest.testFilePath, generatedTest.content, 'utf-8');
}

/**
 * Quick function to generate and optionally write tests
 */
export async function generateTestsForFile(
  filePath: string,
  config: TestGeneratorConfig = {},
  writeToFile: boolean = false
): Promise<GeneratedTest> {
  const generator = new TestGenerator();
  const analysis = await generator.analyzeFile(filePath);
  const tests = await generator.generateTests(analysis, config);

  if (writeToFile) {
    await writeTestFile(tests);
  }

  return tests;
}
