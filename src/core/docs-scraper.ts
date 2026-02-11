import fetch from 'node-fetch';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Fetch a URL and return both raw HTML and stripped text.
 */
export async function fetchPage(url: string): Promise<{ html: string; text: string; ok: boolean }> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,text/plain',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) return { html: '', text: '', ok: false };

        const html = await response.text();
        const text = stripHtml(html);
        return { html, text, ok: true };
    } catch {
        return { html: '', text: '', ok: false };
    }
}

/**
 * Strip HTML to clean text, removing scripts, styles, nav, footer, header.
 */
export function stripHtml(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Extract internal links from HTML that share the same base URL path.
 */
export function extractLinks(html: string, baseUrl: string): string[] {
    const seen = new Set<string>();
    const parsed = new URL(baseUrl);
    const basePath = parsed.pathname.replace(/\/$/, '');
    const baseOrigin = parsed.origin;

    // Match href attributes
    const hrefRegex = /href=["']([^"'#]+)/gi;
    let match: RegExpExecArray | null;

    while ((match = hrefRegex.exec(html)) !== null) {
        let href = match[1].trim();

        // Skip external resources, anchors, assets
        if (href.startsWith('mailto:') || href.startsWith('javascript:') ||
            href.startsWith('#') || href.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|tar|gz)$/i)) {
            continue;
        }

        // Resolve relative URLs
        try {
            const resolved = new URL(href, baseUrl);
            // Only keep same-origin links under the same base path
            if (resolved.origin === baseOrigin && resolved.pathname.startsWith(basePath)) {
                const clean = resolved.origin + resolved.pathname.replace(/\/$/, '');
                if (!seen.has(clean) && clean !== baseUrl.replace(/\/$/, '')) {
                    seen.add(clean);
                }
            }
        } catch {
            // Invalid URL, skip
        }
    }

    return Array.from(seen);
}

export interface ScrapedPage {
    url: string;
    title: string;
    content: string;
}

/**
 * Crawl a docs site starting from a root URL.
 * Follows internal links up to maxPages depth.
 */
export async function crawlDocs(
    rootUrl: string,
    maxPages: number = 25,
    onProgress?: (msg: string) => void,
): Promise<ScrapedPage[]> {
    const pages: ScrapedPage[] = [];
    const visited = new Set<string>();
    const queue: string[] = [rootUrl];

    while (queue.length > 0 && pages.length < maxPages) {
        const url = queue.shift()!;
        const cleanUrl = url.replace(/\/$/, '');
        if (visited.has(cleanUrl)) continue;
        visited.add(cleanUrl);

        onProgress?.(`Fetching (${pages.length + 1}/${maxPages} max): ${cleanUrl}`);

        const { html, text, ok } = await fetchPage(cleanUrl);
        if (!ok || !text || text.length < 50) continue;

        // Extract title from <title> tag
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch
            ? titleMatch[1].replace(/\s+/g, ' ').trim()
            : cleanUrl.split('/').pop() || 'Untitled';

        // Keep only meaningful content (skip if too short)
        const trimmedContent = text.slice(0, 8000); // cap per page
        pages.push({ url: cleanUrl, title, content: trimmedContent });

        // Find more links on this page
        const links = extractLinks(html, rootUrl);
        for (const link of links) {
            if (!visited.has(link.replace(/\/$/, ''))) {
                queue.push(link);
            }
        }
    }

    return pages;
}

/** AI synthesis config passed from SkillManager */
export interface AISynthesisConfig {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    provider?: 'anthropic' | 'openai';
}

/**
 * Build the synthesis prompt from scraped pages.
 */
function buildSynthesisPrompt(name: string, rootUrl: string, pages: ScrapedPage[]): string {
    // Cap total content to ~60K chars to fit in context window
    let totalChars = 0;
    const maxTotalChars = 60_000;
    const pageSummaries: string[] = [];

    for (const page of pages) {
        if (totalChars >= maxTotalChars) break;
        const available = maxTotalChars - totalChars;
        const content = page.content.length > available ? page.content.slice(0, available) : page.content;
        pageSummaries.push(`### ${page.title}\nSource: ${page.url}\n\n${content}`);
        totalChars += content.length;
    }

    const docsContent = pageSummaries.join('\n\n---\n\n');

    return `You are an expert Senior Software Engineer and Technical Writer. I have scraped ${pages.length} pages from the documentation at ${rootUrl}.

Your task is to create a **"Gold Standard" Skill File** for an AI coding assistant. This file will be used by the AI to understand how to write perfect code using "${name}".

### Goal
The output must be a comprehensive, high-density technical guide. It should not just list APIs, but explain **how to think** about the technology, **common patterns**, **pitfalls**, and **best practices**.

### Structure Requirements

1. **YAML Frontmatter**:
   - \`description\`: A concise, high-level summary.
   - \`tags\`: Relevant technical tags (comma-separated).
   - \`source\`: ${rootUrl}

2. **Role & Persona**:
   - Start with "You are an expert [Technology] developer..."
   - Define the mindset and goals (e.g. "Write clean, modern, type-safe code").

3. **Overview**:
   - What problem does this solve?
   - When should you use it?
   - What are the core philosophies?

3. **Critical Concepts (Mental Models)**:
   - Deeply explain the *why* and *how*.
   - Use analogies if helpful.
   - Explain the lifecycle, data flow, or architecture.

4. **Installation & Setup** (Brief):
   - Standard installation commands.
   - Essential configuration.

5. **Common Patterns & "The Right Way"**:
   - **CRITICAL**: Show code examples of how to do things *correctly* in a modern context.
   - Contrast "Old Way" vs "New Way" if applicable (e.g., Options API vs Composition API).
   - Show how to integrate with the broader ecosystem.

6. **Gotchas & Anti-Patterns**:
   - What mistakes do developers commonly make?
   - What has performance implications?
   - Security concerns?

7. **API Reference (High-Frequency)**:
   - Don't list everything. List the 20% of APIs used 80% of the time.
   - Include type signatures if relevant.

### Style Guidelines
- **Tone**: Authoritative, technical, concise, and helpful.
- **Format**: Clean Markdown. Use bolding for emphasis.
- **Code**: All code patterns MUST be valid and idiomatic. Use comments to explain complex lines.
- **No Fluff**: Remove intro/outro chatter. meaningful content only.
- **No raw HTML**: Strict Markdown only.

### Source Documentation Content:

${docsContent}`;
}

/**
 * Call an OpenAI-compatible API (works with Grok, OpenAI, etc.)
 */
async function synthesizeWithOpenAI(
    prompt: string,
    config: AISynthesisConfig,
): Promise<string> {
    let base = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
    let url: string;
    if (base.endsWith('/v1')) {
        url = `${base}/chat/completions`;
    } else {
        url = `${base}/v1/chat/completions`;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model || 'gpt-4',
            messages: [
                { role: 'user', content: prompt },
            ],
            max_tokens: 32768,
            temperature: 0.3,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status} ${text.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('No content in OpenAI response');
    }
    return content;
}

/**
 * Call the Anthropic API (Claude models)
 */
async function synthesizeWithAnthropic(
    prompt: string,
    config: AISynthesisConfig,
): Promise<string> {
    const clientConfig: any = { apiKey: config.apiKey };
    if (config.baseUrl) clientConfig.baseURL = config.baseUrl;
    const client = new Anthropic(clientConfig);

    const response = await client.messages.create({
        model: config.model || 'claude-sonnet-4-20250514',
        max_tokens: 32768,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from AI');
    }
    return textBlock.text;
}

/**
 * Detect provider from model name (same heuristic as agent.ts)
 */
function detectProvider(model?: string): 'anthropic' | 'openai' {
    if (!model) return 'anthropic';
    const m = model.toLowerCase();
    // Claude models → Anthropic
    if (m.includes('claude')) return 'anthropic';
    // GPT, O1, O3, Grok, and other non-Claude models → OpenAI-compatible
    if (m.startsWith('gpt-') || m.startsWith('gpt4') || m.startsWith('o1-') || m.startsWith('o3-') || m.includes('grok')) return 'openai';
    // Default to OpenAI format for unknown models (most custom endpoints use it)
    return 'openai';
}

/**
 * Generate a skill markdown file from scraped documentation pages using AI synthesis.
 * Supports both Anthropic (Claude) and OpenAI-compatible APIs (Grok, GPT, etc.)
 */
export async function generateSkillFromDocs(
    name: string,
    rootUrl: string,
    pages: ScrapedPage[],
    config: AISynthesisConfig,
    onProgress?: (msg: string) => void,
): Promise<string> {
    onProgress?.('Synthesizing skill with AI...');

    const prompt = buildSynthesisPrompt(name, rootUrl, pages);

    // Determine which API to use
    const provider = config.provider || detectProvider(config.model);

    try {
        let skillContent: string;

        if (provider === 'anthropic') {
            onProgress?.(`Using Anthropic API (${config.model || 'claude-sonnet-4-20250514'})...`);
            skillContent = await synthesizeWithAnthropic(prompt, config);
        } else {
            onProgress?.(`Using OpenAI-compatible API (${config.model || 'gpt-4'})...`);
            skillContent = await synthesizeWithOpenAI(prompt, config);
        }

        skillContent = skillContent.trim();

        // Strip any <think> tags (some models use these)
        skillContent = skillContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        // If AI returned content inside markdown code block, extract it
        const codeBlockMatch = skillContent.match(/^```(?:markdown|md)?\n([\s\S]*?)```$/);
        if (codeBlockMatch) {
            skillContent = codeBlockMatch[1].trim();
        }

        // Ensure it has frontmatter
        if (!skillContent.startsWith('---')) {
            skillContent = `---\ndescription: ${name} development guide\ntags: ${name}, docs, learned\nsource: ${rootUrl}\n---\n\n${skillContent}`;
        }

        onProgress?.('AI synthesis complete');
        return skillContent;

    } catch (error: any) {
        onProgress?.(`AI synthesis failed: ${error.message}. Falling back to basic formatting.`);
        // Fallback: create a basic structured file without AI
        return generateBasicSkill(name, rootUrl, pages);
    }
}

/**
 * Fallback: Generate a basic skill file without AI (used when API call fails)
 */
function generateBasicSkill(name: string, rootUrl: string, pages: ScrapedPage[]): string {
    const tags = ['learned', 'docs', name];

    let content = `---\ndescription: Skill learned from ${rootUrl} — ${pages.length} pages scraped\ntags: ${tags.join(', ')}\nsource: ${rootUrl}\n---\n\n`;
    content += `# ${name}\n\n`;
    content += `> Learned from [${rootUrl}](${rootUrl}) — ${pages.length} pages\n\n`;

    for (const page of pages) {
        content += `## ${page.title}\n\n`;
        content += `> Source: ${page.url}\n\n`;
        const section = page.content.length > 4000 ? page.content.slice(0, 4000) + '\n\n...(truncated)' : page.content;
        content += section + '\n\n---\n\n';
    }

    return content;
}
