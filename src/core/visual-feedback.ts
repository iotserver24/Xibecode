import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface VisualFeedbackResult {
    screenshotPath: string;
    domSummary: string;
    consoleLogs: string[];
    errors: string[];
}

export class VisualFeedbackProvider {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private isInitialized: boolean = false;
    private storageDir: string;

    constructor(workingDir: string = process.cwd()) {
        this.storageDir = path.join(workingDir, '.xibecode', 'previews');
    }

    async init(): Promise<void> {
        if (this.isInitialized) return;

        try {
            await fs.mkdir(this.storageDir, { recursive: true });

            this.browser = await chromium.launch({
                headless: true // Run headless for speed
            });

            this.context = await this.browser.newContext({
                viewport: { width: 1280, height: 720 },
                deviceScaleFactor: 1
            });

            this.page = await this.context.newPage();
            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to initialize VisualFeedbackProvider:', error);
            throw error;
        }
    }

    async capture(url: string, captureOptions: { fullPage?: boolean } = {}): Promise<VisualFeedbackResult> {
        if (!this.isInitialized || !this.page) {
            await this.init();
        }

        const page = this.page!;
        const logs: string[] = [];
        const errors: string[] = [];

        // Capture logs
        page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
        page.on('pageerror', err => errors.push(err.message));

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

            // Generate unique filename
            const timestamp = Date.now();
            const filename = `preview_${timestamp}.png`;
            const filepath = path.join(this.storageDir, filename);

            // Screenshot
            await page.screenshot({
                path: filepath,
                fullPage: captureOptions.fullPage ?? false
            });

            // Extract Simplified DOM (Semantic)
            // We strip out scripts, styles, and non-semantic nesting to save tokens
            const domSummary = await page.evaluate(`
                (function() {
                    function simplify(node) {
                        const tag = node.tagName.toLowerCase();
                        const id = node.id ? '#' + node.id : '';
                        const classes = node.classList.length > 0 ? '.' + Array.from(node.classList).join('.') : '';

                        // Skip hidden elements
                        const style = window.getComputedStyle(node);
                        if (style.display === 'none' || style.visibility === 'hidden') return '';

                        // Get text content for leaf nodes
                        const text = node.children.length === 0 && node.textContent && node.textContent.trim()
                            ? ' "' + node.textContent.trim().substring(0, 50) + '"'
                            : '';

                        let childrenHtml = '';
                        for (const child of Array.from(node.children)) {
                            childrenHtml += simplify(child);
                        }

                        // Filter irrelevant tags for AI understanding
                        if (['script', 'style', 'svg', 'noscript', 'iframe'].includes(tag)) return '';

                        // Return simplified representation
                        return '<' + tag + id + classes + '>' + text + childrenHtml + '</' + tag + '>';
                    }
                    return simplify(document.body);
                })()
            `) as string;

            return {
                screenshotPath: filepath,
                domSummary: domSummary.replace(/>\s+</g, '><'), // Minify slightly
                consoleLogs: logs,
                errors: errors
            };

        } catch (error: any) {
            return {
                screenshotPath: '',
                domSummary: '',
                consoleLogs: logs,
                errors: [...errors, error.message]
            };
        } finally {
            // Clean up listeners to avoid leaks if we reuse the page long-term
            page.removeAllListeners('console');
            page.removeAllListeners('pageerror');
        }
    }

    async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.page = null;
            this.isInitialized = false;
        }
    }
}
