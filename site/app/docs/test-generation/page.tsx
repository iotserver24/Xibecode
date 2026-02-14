'use client';

import { TestTube, Code, FileCode, Zap, Shield, Settings } from 'lucide-react';

export default function TestGenerationPage() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold mb-4">AI Test Generation</h1>
        <p className="text-xl text-zinc-400">
          Automatically generate comprehensive test suites for your code using AI-powered analysis.
        </p>
      </div>

      {/* Quick Start */}
      <div className="p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
        <h2 className="text-xl font-bold text-white mb-4">Quick Start</h2>
        <div className="space-y-4">
          <div>
            <div className="text-sm text-zinc-400 mb-2">Via CLI (in chat mode):</div>
            <div className="bg-zinc-900/50 rounded-lg p-4 font-mono text-sm">
              <div className="text-emerald-400">&gt; generate tests for src/utils/helpers.ts</div>
            </div>
          </div>
          <div>
            <div className="text-sm text-zinc-400 mb-2">Via WebUI:</div>
            <ol className="list-decimal list-inside text-zinc-400 space-y-1">
              <li>Open the WebUI: <code className="text-violet-400">xibecode ui --open</code></li>
              <li>Go to the "Test Generator" tab</li>
              <li>Enter file path</li>
              <li>Click "Generate Tests"</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Supported Frameworks */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Supported Frameworks</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <FrameworkCard
            name="Vitest"
            language="JavaScript/TypeScript"
            features={['describe/it blocks', 'vi.mock() setup', 'expect assertions']}
          />
          <FrameworkCard
            name="Jest"
            language="JavaScript/TypeScript"
            features={['describe/it blocks', 'jest.mock() setup', 'expect assertions']}
          />
          <FrameworkCard
            name="Mocha"
            language="JavaScript/TypeScript"
            features={['describe/it blocks', 'Sinon mocks', 'Chai assertions']}
          />
          <FrameworkCard
            name="pytest"
            language="Python"
            features={['class TestX format', 'Mock/patch setup', 'assert statements']}
          />
          <FrameworkCard
            name="Go test"
            language="Go"
            features={['func TestX format', 'testify/mock', 'assert package']}
          />
          <FrameworkCard
            name="Auto-detect"
            language="Any"
            features={['Reads package.json', 'Checks dependencies', 'Falls back to Vitest']}
          />
        </div>
      </div>

      {/* Features */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Features</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <FeatureCard
            icon={Code}
            title="Code Analysis"
            description="Understands functions, classes, types, imports, and exports. Detects complexity and dependencies."
          />
          <FeatureCard
            icon={Zap}
            title="Edge Case Generation"
            description="Automatically generates tests for null values, empty strings, boundary conditions, and error cases."
          />
          <FeatureCard
            icon={Shield}
            title="Type Checking"
            description="Creates assertions for return types, ensuring functions return expected data types."
          />
          <FeatureCard
            icon={Settings}
            title="Mock Setup"
            description="Automatically configures mocks for dependencies and external modules."
          />
        </div>
      </div>

      {/* API */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Tool API</h2>
        <p className="text-zinc-400 mb-4">
          Two tools are available for test generation:
        </p>

        <div className="space-y-6">
          <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-violet-400 mb-2 font-mono">generate_tests</h3>
            <p className="text-sm text-zinc-400 mb-3">
              Analyze a source file and generate comprehensive test cases.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3 font-semibold">Parameter</th>
                    <th className="text-left py-2 px-3 font-semibold">Type</th>
                    <th className="text-left py-2 px-3 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-white/5">
                    <td className="py-2 px-3 font-mono text-emerald-400">file_path</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3">Path to source file (required)</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 px-3 font-mono text-emerald-400">framework</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3">vitest, jest, mocha, pytest, go (auto-detected)</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 px-3 font-mono text-emerald-400">output_dir</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3">Custom output directory for tests</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 px-3 font-mono text-emerald-400">include_edge_cases</td>
                    <td className="py-2 px-3">boolean</td>
                    <td className="py-2 px-3">Include edge case tests (default: true)</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 px-3 font-mono text-emerald-400">include_mocks</td>
                    <td className="py-2 px-3">boolean</td>
                    <td className="py-2 px-3">Include mock setup code (default: true)</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 px-3 font-mono text-emerald-400">max_tests_per_function</td>
                    <td className="py-2 px-3">number</td>
                    <td className="py-2 px-3">Maximum tests per function (default: 5)</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 px-3 font-mono text-emerald-400">write_file</td>
                    <td className="py-2 px-3">boolean</td>
                    <td className="py-2 px-3">Write to file (default: false)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-violet-400 mb-2 font-mono">analyze_code_for_tests</h3>
            <p className="text-sm text-zinc-400 mb-3">
              Analyze a source file to understand its structure before generating tests.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3 font-semibold">Parameter</th>
                    <th className="text-left py-2 px-3 font-semibold">Type</th>
                    <th className="text-left py-2 px-3 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-white/5">
                    <td className="py-2 px-3 font-mono text-emerald-400">file_path</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3">Path to source file (required)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Example Output */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Example Output</h2>
        <p className="text-zinc-400 mb-4">
          Given a file with a <code className="text-violet-400">calculateTotal</code> function:
        </p>
        <div className="bg-zinc-900/50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-zinc-300">{`import { describe, it, expect, vi } from 'vitest';
import { calculateTotal } from '../utils/helpers';

// Mock setup
beforeEach(() => {
  vi.clearAllMocks();
});

describe('calculateTotal', () => {
  it('should execute calculateTotal successfully', () => {
    expect(calculateTotal([])).toBeDefined();
  });

  it('should return correct type from calculateTotal', () => {
    expect(typeof calculateTotal([])).toBe('number');
  });

  it('should handle empty array', () => {
    expect(calculateTotal([])).toBe(0);
  });

  it('should handle single element', () => {
    expect(calculateTotal([10])).toBe(10);
  });

  it('should handle errors in calculateTotal', () => {
    expect(() => calculateTotal(undefined)).toThrow();
  });
});`}</pre>
        </div>
      </div>

      {/* Test Types */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Generated Test Types</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 font-semibold">Type</th>
                <th className="text-left py-3 px-4 font-semibold">Description</th>
                <th className="text-left py-3 px-4 font-semibold">Example</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">unit</td>
                <td className="py-3 px-4">Basic functionality tests</td>
                <td className="py-3 px-4">Function returns expected value</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">edge</td>
                <td className="py-3 px-4">Edge case and boundary tests</td>
                <td className="py-3 px-4">Empty string, null, MAX_INT</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">boundary</td>
                <td className="py-3 px-4">Boundary condition tests</td>
                <td className="py-3 px-4">Array length 0, 1, MAX</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 px-4 font-mono text-violet-400">error</td>
                <td className="py-3 px-4">Error handling tests</td>
                <td className="py-3 px-4">Invalid input throws error</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Best Practices */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Best Practices</h2>
        <ul className="list-disc list-inside text-zinc-400 space-y-2">
          <li><strong className="text-white">Review generated tests</strong> - AI-generated tests are a starting point, not the final product</li>
          <li><strong className="text-white">Add domain-specific assertions</strong> - The generator may miss business logic requirements</li>
          <li><strong className="text-white">Use write_file: false first</strong> - Preview tests before writing to disk</li>
          <li><strong className="text-white">Run tests after generation</strong> - Verify they pass and cover expected behavior</li>
          <li><strong className="text-white">Customize edge cases</strong> - Add project-specific edge cases as needed</li>
        </ul>
      </div>

      {/* Integration with WebUI */}
      <div className="p-6 rounded-xl border border-violet-500/20 bg-violet-500/5">
        <h2 className="text-xl font-bold text-white mb-4">WebUI Integration</h2>
        <p className="text-zinc-400 mb-4">
          The easiest way to use test generation is through the WebUI:
        </p>
        <div className="bg-zinc-900/50 rounded-lg p-4 font-mono text-sm">
          <div className="text-emerald-400">xibecode ui --open</div>
        </div>
        <p className="text-zinc-400 mt-4">
          Then navigate to the "Test Generator" tab for a visual interface with file path input,
          framework selection, and instant preview of generated tests.
        </p>
      </div>
    </div>
  );
}

function FrameworkCard({ name, language, features }: { name: string; language: string; features: string[] }) {
  return (
    <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
      <h3 className="font-semibold text-white mb-1">{name}</h3>
      <p className="text-xs text-zinc-500 mb-3">{language}</p>
      <ul className="text-sm text-zinc-400 space-y-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="text-emerald-400">+</span> {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02]">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-semibold text-white mb-1">{title}</h3>
          <p className="text-sm text-zinc-400">{description}</p>
        </div>
      </div>
    </div>
  );
}
