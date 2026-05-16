import { createServer, type Server } from 'http';
import * as fs from 'fs';
import * as path from 'path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
};

const existsAsync = async (p: string) => {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
};

export class PreviewServer {
  private server: Server | null = null;
  private port: number = 0;
  private rootDir: string = '';

  async start(rootDir: string, preferredPort?: number): Promise<number> {
    this.stop();
    this.rootDir = rootDir;

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res);
      });

      const targetPort = preferredPort ?? 0;

      this.server.listen(targetPort, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });

      this.server.on('error', (err: any) => {
        reject(err);
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = 0;
    }
  }

  getPort(): number {
    return this.port;
  }

  getUrl(): string {
    return this.port ? `http://127.0.0.1:${this.port}` : '';
  }

  private async handleRequest(req: any, res: any): Promise<void> {
    const urlPath = req.url.split('?')[0];
    let filePath = path.join(this.rootDir, urlPath === '/' ? 'index.html' : urlPath);

    // ⚡ Bolt: Replace synchronous file operations with async promises to prevent blocking the main thread
    if (!(await existsAsync(filePath))) {
      const htmlPath = filePath + '.html';
      if (await existsAsync(htmlPath)) {
        filePath = htmlPath;
      } else {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
    }

    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.isDirectory()) {
        const indexPath = path.join(filePath, 'index.html');
        if (await existsAsync(indexPath)) {
          filePath = indexPath;
        } else {
          res.writeHead(403);
          res.end('Directory listing not allowed');
          return;
        }
      }
    } catch {
      res.writeHead(500);
      res.end('Internal server error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    // ⚡ Bolt: Use stream piping instead of readFileSync to avoid loading large files fully into memory
    const readStream = fs.createReadStream(filePath);
    readStream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end('Failed to read file');
    });
    readStream.on('open', () => {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      });
    });
    readStream.pipe(res);
  }
}
