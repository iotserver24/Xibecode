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

/**
 * Generate a skill markdown file from scraped documentation pages using AI synthesis.
 * The AI reads the scraped content and produces a clean, structured, actionable skill file.
 */
export async function generateSkillFromDocs(
    name: string,
    rootUrl: string,
    pages: ScrapedPage[],
    apiKey: string,
    baseUrl?: string,
    model?: string,
    onProgress?: (msg: string) => void,
): Promise<string> {
    onProgress?.('Synthesizing skill with AI...');

    // Prepare a condensed summary of all scraped pages for the AI
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

    const prompt = `You are an expert at creating AI coding assistant skills. I scraped ${pages.length} pages from the documentation at ${rootUrl}.

Your task: Read and understand the documentation below, then create a comprehensive, well-structured SKILL FILE in Markdown format.

The skill file should be a practical guide that an AI coding assistant can use to help developers work with "${name}". It should include:

1. **YAML frontmatter** with:
   - description: A clear one-line description
   - tags: Relevant comma-separated tags
   - source: ${rootUrl}

2. **Overview section**: Brief explanation of what ${name} is and what it's used for

3. **Key concepts**: The most important concepts, APIs, and patterns from the docs

4. **Common patterns & code examples**: Real, practical code snippets showing common usage (properly formatted in code blocks)

5. **Best practices**: Important tips, gotchas, and recommendations

6. **Quick reference**: A concise cheat-sheet of the most-used APIs/commands

IMPORTANT RULES:
- Write clean, well-formatted Markdown
- Include REAL code examples from the documentation (properly formatted in fenced code blocks)
- Be comprehensive but concise — focus on what a developer would actually need
- Do NOT include navigation text, menu items, or HTML artifacts
- Do NOT include raw HTML or broken formatting
- Make the skill genuinely useful for an AI assistant helping developers

Here is the scraped documentation:

${docsContent}`;

    const clientConfig: any = { apiKey };
    if (baseUrl) clientConfig.baseURL = baseUrl;
    const client = new Anthropic(clientConfig);

    try {
        const response = await client.messages.create({
            model: model || 'claude-sonnet-4-20250514',
            max_tokens: 32768,
            temperature: 0.3,
            messages: [{ role: 'user', content: prompt }],
        });

        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            throw new Error('No text response from AI');
        }

        let skillContent = textBlock.text.trim();

        // Strip any <think> tags
        skillContent = skillContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

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
