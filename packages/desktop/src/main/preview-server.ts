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

  private handleRequest(req: any, res: any): void {
    const urlPath = req.url.split('?')[0];
    let filePath = path.join(this.rootDir, urlPath === '/' ? 'index.html' : urlPath);

    if (!fs.existsSync(filePath)) {
      const htmlPath = filePath + '.html';
      if (fs.existsSync(htmlPath)) {
        filePath = htmlPath;
      } else {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
    }

    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const indexPath = path.join(filePath, 'index.html');
        if (fs.existsSync(indexPath)) {
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

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    } catch {
      res.writeHead(500);
      res.end('Failed to read file');
    }
  }
}
