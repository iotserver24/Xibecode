import { vi } from 'vitest';

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

// Mock process methods
Object.defineProperty(process, 'platform', {
  value: 'linux',
  writable: true,
});

// Mock fs module
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
  unlink: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
}));

// Mock path module
vi.mock('path', () => ({
  resolve: vi.fn((...args) => args.join('/')),
  dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/')),
  join: vi.fn((...args) => args.join('/')),
  parse: vi.fn((p) => {
    const parts = p.split('/');
    return {
      dir: parts.slice(0, -1).join('/'),
      base: parts[parts.length - 1],
      ext: parts[parts.length - 1].includes('.') ? '.' + parts[parts.length - 1].split('.').pop() : '',
      name: parts[parts.length - 1].replace(/\.[^/.]+$/, ''),
    };
  }),
  extname: vi.fn((p) => {
    const match = p.match(/\.[^/.]+$/);
    return match ? match[0] : '';
  }),
}));

// Mock other dependencies
vi.mock('fast-glob', () => ({
  default: vi.fn(),
}));

vi.mock('diff', () => ({
  createPatch: vi.fn(),
  applyPatch: vi.fn(),
  parsePatch: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}));

vi.mock('commander', () => ({
  Command: vi.fn(),
}));

vi.mock('chalk', () => ({
  default: {
    cyan: vi.fn((text) => text),
    red: vi.fn((text) => text),
    green: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
    gray: vi.fn((text) => text),
    white: vi.fn((text) => text),
    bold: vi.fn((text) => text),
  },
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock('conf', () => ({
  default: vi.fn(),
}));

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

vi.mock('os', () => ({
  default: {
    platform: vi.fn(() => 'linux'),
    homedir: vi.fn(() => '/home/user'),
  },
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn((fn) => fn),
}));

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

vi.mock('strip-ansi', () => ({
  default: vi.fn((str) => str),
}));

// Setup global test environment
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});