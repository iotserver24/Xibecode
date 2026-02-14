import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Viewport configuration for responsive testing
 */
export interface ViewportConfig {
    name: string;
    width: number;
    height: number;
}

/**
 * Performance metrics from Core Web Vitals
 */
export interface PerformanceMetrics {
    url: string;
    loadTime: number;
    domContentLoaded: number;
    firstContentfulPaint: number | null;
    largestContentfulPaint: number | null;
    cumulativeLayoutShift: number | null;
    timeToInteractive: number | null;
}

/**
 * Network request captured during page load
 */
export interface NetworkRequest {
    url: string;
    method: string;
    status: number | null;
    resourceType: string;
    duration: number | null;
}

/**
 * Accessibility issue found during audit
 */
export interface AccessibilityIssue {
    type: 'error' | 'warning' | 'notice';
    message: string;
    selector?: string;
    context?: string;
}

/**
 * Visual test result comparing screenshots
 */
export interface VisualTestResult {
    match: boolean;
    diffPercentage: number;
    baselineExists: boolean;
    screenshotPath: string;
    diffPath?: string;
}

/**
 * Responsive test result for a single viewport
 */
export interface ResponsiveTestResult {
    viewport: ViewportConfig;
    screenshotPath: string;
    loadTime: number;
    errors: string[];
}

/**
 * Default viewports for responsive testing
 */
export const DEFAULT_VIEWPORTS: ViewportConfig[] = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'desktop-large', width: 1920, height: 1080 },
];

/**
 * BrowserManager - Playwright-based browser automation for XibeCode
 *
 * Provides tools for:
 * - Screenshot capture
 * - Console log collection
 * - Visual regression testing
 * - Performance metrics (Core Web Vitals)
 * - Accessibility auditing
 * - Responsive testing
 * - Network monitoring
 */
export class BrowserManager {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;

    private async getBrowser(): Promise<BrowserContext> {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            this.context = await this.browser.newContext();
        }
        if (!this.context) {
            this.context = await this.browser.newContext();
        }
        return this.context;
    }

    async close(): Promise<void> {
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    /**
     * Take a screenshot of a webpage
     */
    async takeScreenshot(url: string, outputPath: string, fullPage: boolean = true): Promise<string> {
        const context = await this.getBrowser();
        const page = await context.newPage();
        try {
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.screenshot({ path: outputPath, fullPage });
            return `Screenshot saved to ${outputPath}`;
        } catch (error: any) {
            throw new Error(`Failed to take screenshot: ${error.message}`);
        } finally {
            await page.close();
        }
    }

    /**
     * Get console logs from a webpage
     */
    async getConsoleLogs(url: string, timeout: number = 5000): Promise<string[]> {
        const context = await this.getBrowser();
        const page = await context.newPage();
        const logs: string[] = [];

        page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
        page.on('pageerror', (err: any) => logs.push(`[error] ${err.message}`));

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(timeout);
            return logs;
        } catch (error: any) {
            return [`Error loading page: ${error.message}`];
        } finally {
            await page.close();
        }
    }

    /**
     * Run a visual regression test by comparing screenshots
     */
    async runVisualTest(
        url: string,
        baselinePath: string,
        outputDir: string = '.playwright-baselines'
    ): Promise<VisualTestResult> {
        const context = await this.getBrowser();
        const page = await context.newPage();

        try {
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

            // Ensure output directory exists
            await fs.mkdir(outputDir, { recursive: true });

            const screenshotPath = path.join(outputDir, 'current.png');
            await page.screenshot({ path: screenshotPath, fullPage: true });

            // Check if baseline exists
            let baselineExists = false;
            try {
                await fs.access(baselinePath);
                baselineExists = true;
            } catch {
                // Baseline doesn't exist, create it
                await fs.copyFile(screenshotPath, baselinePath);
                return {
                    match: true,
                    diffPercentage: 0,
                    baselineExists: false,
                    screenshotPath,
                };
            }

            // Simple pixel comparison (for basic visual testing)
            const currentBuffer = await fs.readFile(screenshotPath);
            const baselineBuffer = await fs.readFile(baselinePath);

            const match = currentBuffer.equals(baselineBuffer);

            return {
                match,
                diffPercentage: match ? 0 : 100, // Simplified - would need pixelmatch for accurate diff
                baselineExists: true,
                screenshotPath,
            };
        } catch (error: any) {
            throw new Error(`Visual test failed: ${error.message}`);
        } finally {
            await page.close();
        }
    }

    /**
     * Check basic accessibility issues on a page
     */
    async checkAccessibility(url: string): Promise<AccessibilityIssue[]> {
        const context = await this.getBrowser();
        const page = await context.newPage();
        const issues: AccessibilityIssue[] = [];

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

            // Check for common accessibility issues
            const checks = await page.evaluate(() => {
                const issues: { type: string; message: string; selector?: string; context?: string }[] = [];

                // Check images without alt text
                document.querySelectorAll('img').forEach((img, i) => {
                    if (!img.alt && !img.getAttribute('aria-label')) {
                        issues.push({
                            type: 'error',
                            message: 'Image missing alt text',
                            selector: `img:nth-of-type(${i + 1})`,
                            context: img.src?.substring(0, 50),
                        });
                    }
                });

                // Check form inputs without labels
                document.querySelectorAll('input, select, textarea').forEach((input, i) => {
                    const id = input.id;
                    const hasLabel = id && document.querySelector(`label[for="${id}"]`);
                    const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');

                    if (!hasLabel && !hasAriaLabel) {
                        issues.push({
                            type: 'error',
                            message: 'Form input missing label',
                            selector: `${input.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
                            context: input.getAttribute('name') || input.getAttribute('placeholder') || undefined,
                        });
                    }
                });

                // Check for empty links
                document.querySelectorAll('a').forEach((link, i) => {
                    const hasText = link.textContent?.trim();
                    const hasAriaLabel = link.getAttribute('aria-label');
                    const hasTitle = link.getAttribute('title');

                    if (!hasText && !hasAriaLabel && !hasTitle) {
                        issues.push({
                            type: 'warning',
                            message: 'Link has no accessible text',
                            selector: `a:nth-of-type(${i + 1})`,
                            context: link.href?.substring(0, 50),
                        });
                    }
                });

                // Check for missing document language
                if (!document.documentElement.lang) {
                    issues.push({
                        type: 'warning',
                        message: 'Document missing lang attribute',
                        selector: 'html',
                    });
                }

                // Check for missing page title
                if (!document.title) {
                    issues.push({
                        type: 'error',
                        message: 'Page missing title',
                        selector: 'head',
                    });
                }

                // Check heading hierarchy
                const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
                let lastLevel = 0;
                headings.forEach((heading, i) => {
                    const level = parseInt(heading.tagName[1]);
                    if (level > lastLevel + 1 && lastLevel !== 0) {
                        issues.push({
                            type: 'warning',
                            message: `Heading level skipped from h${lastLevel} to h${level}`,
                            selector: `${heading.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
                            context: heading.textContent?.substring(0, 30),
                        });
                    }
                    lastLevel = level;
                });

                // Check for sufficient color contrast (basic check)
                const buttons = document.querySelectorAll('button, [role="button"]');
                buttons.forEach((button, i) => {
                    const styles = window.getComputedStyle(button);
                    if (styles.backgroundColor === 'transparent' && !button.querySelector('img, svg')) {
                        issues.push({
                            type: 'notice',
                            message: 'Button may have contrast issues',
                            selector: `button:nth-of-type(${i + 1})`,
                            context: (button as HTMLElement).textContent?.substring(0, 30),
                        });
                    }
                });

                return issues;
            });

            return checks.map(c => ({
                type: c.type as 'error' | 'warning' | 'notice',
                message: c.message,
                selector: c.selector,
                context: c.context,
            }));
        } catch (error: any) {
            throw new Error(`Accessibility check failed: ${error.message}`);
        } finally {
            await page.close();
        }
    }

    /**
     * Measure Core Web Vitals and performance metrics
     */
    async measurePerformance(url: string): Promise<PerformanceMetrics> {
        const context = await this.getBrowser();
        const page = await context.newPage();

        try {
            const startTime = Date.now();

            // Navigate and measure timing
            await page.goto(url, { waitUntil: 'load', timeout: 30000 });
            const loadTime = Date.now() - startTime;

            // Get performance metrics from browser
            const metrics = await page.evaluate(() => {
                const perf = performance;
                const navigation = perf.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
                const paint = perf.getEntriesByType('paint');

                // Get First Contentful Paint
                const fcp = paint.find(p => p.name === 'first-contentful-paint');

                // Get Largest Contentful Paint (if available)
                let lcp: number | null = null;
                try {
                    const lcpEntries = perf.getEntriesByType('largest-contentful-paint');
                    if (lcpEntries.length > 0) {
                        lcp = lcpEntries[lcpEntries.length - 1].startTime;
                    }
                } catch {
                    // LCP not available
                }

                // Get Cumulative Layout Shift (if available)
                let cls: number | null = null;
                try {
                    const layoutShiftEntries = perf.getEntriesByType('layout-shift') as any[];
                    cls = layoutShiftEntries
                        .filter(entry => !entry.hadRecentInput)
                        .reduce((sum, entry) => sum + entry.value, 0);
                } catch {
                    // CLS not available
                }

                return {
                    domContentLoaded: navigation?.domContentLoadedEventEnd - navigation?.startTime || 0,
                    firstContentfulPaint: fcp?.startTime || null,
                    largestContentfulPaint: lcp,
                    cumulativeLayoutShift: cls,
                    timeToInteractive: navigation?.domInteractive - navigation?.startTime || null,
                };
            });

            return {
                url,
                loadTime,
                domContentLoaded: metrics.domContentLoaded,
                firstContentfulPaint: metrics.firstContentfulPaint,
                largestContentfulPaint: metrics.largestContentfulPaint,
                cumulativeLayoutShift: metrics.cumulativeLayoutShift,
                timeToInteractive: metrics.timeToInteractive,
            };
        } catch (error: any) {
            throw new Error(`Performance measurement failed: ${error.message}`);
        } finally {
            await page.close();
        }
    }

    /**
     * Test a page across multiple viewport sizes
     */
    async testResponsive(
        url: string,
        outputDir: string,
        viewports: ViewportConfig[] = DEFAULT_VIEWPORTS
    ): Promise<ResponsiveTestResult[]> {
        const context = await this.getBrowser();
        const results: ResponsiveTestResult[] = [];

        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });

        for (const viewport of viewports) {
            const page = await context.newPage();
            const errors: string[] = [];

            page.on('pageerror', (err) => errors.push(err.message));
            page.on('console', (msg) => {
                if (msg.type() === 'error') {
                    errors.push(msg.text());
                }
            });

            try {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });

                const startTime = Date.now();
                await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
                const loadTime = Date.now() - startTime;

                const screenshotPath = path.join(outputDir, `${viewport.name}-${viewport.width}x${viewport.height}.png`);
                await page.screenshot({ path: screenshotPath, fullPage: true });

                results.push({
                    viewport,
                    screenshotPath,
                    loadTime,
                    errors,
                });
            } catch (error: any) {
                results.push({
                    viewport,
                    screenshotPath: '',
                    loadTime: 0,
                    errors: [error.message],
                });
            } finally {
                await page.close();
            }
        }

        return results;
    }

    /**
     * Capture all network requests made during page load
     */
    async captureNetworkRequests(url: string): Promise<NetworkRequest[]> {
        const context = await this.getBrowser();
        const page = await context.newPage();
        const requests: NetworkRequest[] = [];
        const requestTimings = new Map<string, number>();

        page.on('request', (request) => {
            requestTimings.set(request.url(), Date.now());
        });

        page.on('response', (response) => {
            const request = response.request();
            const startTime = requestTimings.get(request.url());
            const duration = startTime ? Date.now() - startTime : null;

            requests.push({
                url: request.url(),
                method: request.method(),
                status: response.status(),
                resourceType: request.resourceType(),
                duration,
            });
        });

        page.on('requestfailed', (request) => {
            const startTime = requestTimings.get(request.url());
            const duration = startTime ? Date.now() - startTime : null;

            requests.push({
                url: request.url(),
                method: request.method(),
                status: null,
                resourceType: request.resourceType(),
                duration,
            });
        });

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            return requests;
        } catch (error: any) {
            // Return what we captured even on error
            return requests;
        } finally {
            await page.close();
        }
    }

    /**
     * Run a Playwright test file
     */
    async runPlaywrightTest(testPath: string, options?: {
        headed?: boolean;
        browser?: 'chromium' | 'firefox' | 'webkit';
        timeout?: number;
    }): Promise<{ success: boolean; output: string }> {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const args = ['npx', 'playwright', 'test', testPath];

        if (options?.headed) {
            args.push('--headed');
        }
        if (options?.browser) {
            args.push('--project=' + options.browser);
        }
        if (options?.timeout) {
            args.push('--timeout=' + options.timeout);
        }

        try {
            const { stdout, stderr } = await execAsync(args.join(' '), {
                timeout: options?.timeout || 120000,
            });
            return {
                success: true,
                output: stdout + (stderr ? '\n' + stderr : ''),
            };
        } catch (error: any) {
            return {
                success: false,
                output: error.stdout + (error.stderr ? '\n' + error.stderr : ''),
            };
        }
    }
}
