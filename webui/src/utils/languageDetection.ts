const EXTENSION_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',

  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'less',
  '.vue': 'vue',
  '.svelte': 'svelte',

  // Data formats
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.csv': 'csv',

  // Markdown
  '.md': 'markdown',
  '.mdx': 'markdown',

  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',

  // Rust
  '.rs': 'rust',

  // Go
  '.go': 'go',

  // Java/Kotlin
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',

  // C/C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',

  // C#
  '.cs': 'csharp',

  // PHP
  '.php': 'php',

  // Ruby
  '.rb': 'ruby',
  '.erb': 'erb',

  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',

  // SQL
  '.sql': 'sql',

  // GraphQL
  '.graphql': 'graphql',
  '.gql': 'graphql',

  // Docker
  '.dockerfile': 'dockerfile',

  // Swift
  '.swift': 'swift',

  // Perl
  '.pl': 'perl',
  '.pm': 'perl',

  // R
  '.r': 'r',
  '.R': 'r',

  // Lua
  '.lua': 'lua',

  // Elixir
  '.ex': 'elixir',
  '.exs': 'elixir',

  // Haskell
  '.hs': 'haskell',

  // Scala
  '.scala': 'scala',

  // Clojure
  '.clj': 'clojure',
  '.cljs': 'clojure',

  // PowerShell
  '.ps1': 'powershell',
  '.psm1': 'powershell',

  // Config files
  '.env': 'ini',
  '.gitignore': 'ignore',
  '.dockerignore': 'ignore',
  '.editorconfig': 'ini',
};

const FILENAME_MAP: Record<string, string> = {
  'Dockerfile': 'dockerfile',
  'Makefile': 'makefile',
  'CMakeLists.txt': 'cmake',
  '.gitignore': 'ignore',
  '.dockerignore': 'ignore',
  '.env': 'ini',
  '.env.local': 'ini',
  '.env.development': 'ini',
  '.env.production': 'ini',
  'package.json': 'json',
  'tsconfig.json': 'jsonc',
  'jsconfig.json': 'jsonc',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
};

export function getLanguageFromPath(filePath: string): string {
  // Check filename first
  const fileName = filePath.split('/').pop() || '';
  if (FILENAME_MAP[fileName]) {
    return FILENAME_MAP[fileName];
  }

  // Check extension
  const ext = fileName.includes('.')
    ? '.' + fileName.split('.').pop()?.toLowerCase()
    : '';

  return EXTENSION_MAP[ext] || 'plaintext';
}

export function getFileIcon(filePath: string, isDirectory: boolean): string {
  if (isDirectory) {
    return '📁';
  }

  const language = getLanguageFromPath(filePath);
  const iconMap: Record<string, string> = {
    typescript: '🔷',
    javascript: '🟨',
    python: '🐍',
    rust: '🦀',
    go: '🐹',
    java: '☕',
    html: '🌐',
    css: '🎨',
    json: '📋',
    markdown: '📝',
    shell: '💻',
    dockerfile: '🐳',
    yaml: '⚙️',
  };

  return iconMap[language] || '📄';
}
