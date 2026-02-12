import puppeteer, { Browser, ConsoleMessage } from 'puppeteer';

export class BrowserManager {
    private browser: Browser | null = null;

    private async getBrowser(): Promise<Browser> {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'], // Safer for containerized envs
            });
        }
        return this.browser;
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async takeScreenshot(url: string, outputPath: string, fullPage: boolean = true): Promise<string> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        try {
            await page.setViewport({ width: 1280, height: 800 });

            // Navigate and wait for network idle to ensure assets load
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

            await page.screenshot({ path: outputPath, fullPage });
            return `Screenshot saved to ${outputPath}`;
        } catch (error: any) {
            throw new Error(`Failed to take screenshot: ${error.message}`);
        } finally {
            await page.close();
        }
    }

    async getConsoleLogs(url: string, timeout: number = 5000): Promise<string[]> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        const logs: string[] = [];

        page.on('console', (msg: ConsoleMessage) => logs.push(`[${msg.type()}] ${msg.text()}`));
        page.on('pageerror', (err: any) => logs.push(`[error] ${err.message}`));

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            // Wait a bit for async logs
            await new Promise(resolve => setTimeout(resolve, timeout));
            return logs;
        } catch (error: any) {
            return [`Error loading page: ${error.message}`];
        } finally {
            await page.close();
        }
    }
}
