import { create, insert } from '@orama/orama';
import { persist } from '@orama/plugin-data-persistence';
import fs from 'fs';
import path from 'path';

const CONTENT_DIR = path.join(process.cwd(), 'content', 'docs');
const OUTPUT_DIR = path.join(process.cwd(), 'public');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'search-index.json');

function getFiles(dir) {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const files = dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  });
  return Array.prototype.concat(...files);
}

// Strip frontmatter from MDX content
function stripFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (match) return { frontmatter: match[1], body: match[2] };
  return { frontmatter: '', body: content };
}

// Parse frontmatter fields
function parseFrontmatter(fm) {
  const result = {};
  for (const line of fm.split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      let value = match[2].trim();
      // Handle YAML arrays like [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim());
      }
      result[match[1]] = value;
    }
  }
  return result;
}

// Clean markdown syntax for better plain-text indexing
function cleanMarkdown(text) {
  return text
    // Remove MDX components like <Cards>, <Card>, <Callout> etc
    .replace(/<[A-Z][a-zA-Z]*[^>]*>/g, '')
    .replace(/<\/[A-Z][a-zA-Z]*>/g, '')
    // Remove markdown links but keep text: [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images: ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove heading markers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove code block fences but keep content
    .replace(/```[\w]*\n/g, '\n')
    .replace(/```/g, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove table separators
    .replace(/\|[-:]+\|/g, '')
    // Clean up pipes in tables
    .replace(/\|/g, ' ')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Collapse whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

async function build() {
  console.log('🏗️  Building Orama Search Index...');

  const db = await create({
    schema: {
      title: 'string',
      description: 'string',
      keywords: 'string',
      url: 'string',
      content: 'string',
    },
  });

  const files = getFiles(CONTENT_DIR).filter(f => f.endsWith('.mdx') || f.endsWith('.md'));

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8');
    const { frontmatter, body } = stripFrontmatter(raw);
    const fm = parseFrontmatter(frontmatter);

    const title = fm.title || path.basename(file, path.extname(file));
    const description = fm.description || '';
    const keywords = Array.isArray(fm.keywords) ? fm.keywords.join(', ') : (fm.keywords || '');

    const relativePath = path.relative(CONTENT_DIR, file).replace(/\\/g, '/').replace(/\.mdx?$/, '');
    const url = `/docs/${relativePath === 'index' ? '' : relativePath}`;

    // Clean body for better search matching
    const cleanedContent = cleanMarkdown(body);

    // Combine everything for maximum searchability
    const fullContent = [
      title,
      description,
      keywords,
      cleanedContent
    ].filter(Boolean).join('\n\n');

    await insert(db, {
      title,
      description,
      keywords,
      url,
      content: fullContent,
    });

    console.log(`  ✓ Indexed: ${title} (${fullContent.length} chars, ${url})`);
  }

  const index = await persist(db, 'json');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_FILE, index);

  console.log(`\n✅ Index saved to ${OUTPUT_FILE} (${files.length} pages indexed)`);
}

build();
