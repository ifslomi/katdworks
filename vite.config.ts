import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const uploadsRoot = path.resolve(__dirname, 'uploads');

function sanitizeSegment(input: string) {
  return input.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function extensionFromMime(mimeType: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('svg')) return 'svg';
  if (mimeType.includes('pdf')) return 'pdf';
  return 'bin';
}

function contentTypeFromExt(ext: string) {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

async function handleUpload(req: any, res: any) {
  try {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve());
      req.on('error', (error: Error) => reject(error));
    });

    const raw = Buffer.concat(chunks).toString('utf8');
    const body = JSON.parse(raw) as {
      fileName?: string;
      mimeType?: string;
      dataUrl?: string;
      folder?: string;
    };

    const dataUrl = body.dataUrl;
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing or invalid data payload.' }));
      return;
    }

    const parts = dataUrl.split(',');
    if (parts.length !== 2) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Malformed data URL.' }));
      return;
    }

    const buffer = Buffer.from(parts[1], 'base64');
    if (!buffer.length) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Uploaded file is empty.' }));
      return;
    }

    const folder = sanitizeSegment(body.folder || 'files');
    const mimeType = body.mimeType || 'application/octet-stream';
    const originalName = body.fileName || 'upload';

    const safeNameBase = sanitizeSegment(path.parse(originalName).name) || 'upload';
    const parsedExt = path.parse(originalName).ext.replace('.', '').toLowerCase();
    const ext = parsedExt || extensionFromMime(mimeType);
    const uniqueName = `${Date.now()}_${safeNameBase}.${ext}`;

    const folderPath = path.resolve(uploadsRoot, folder);
    if (!folderPath.startsWith(uploadsRoot)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid upload target.' }));
      return;
    }

    await fs.mkdir(folderPath, { recursive: true });
    const filePath = path.resolve(folderPath, uniqueName);
    await fs.writeFile(filePath, buffer);

    res.statusCode = 201;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ url: `/uploads/${folder}/${uniqueName}` }));
  } catch (error) {
    console.error('Vite upload handler failed:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to store file locally.' }));
  }
}

function localUploadsPlugin() {
  const attachMiddlewares = (middlewares: any) => {
    middlewares.use(async (req: any, res: any, next: any) => {
      if (req.url?.startsWith('/api/upload') && req.method === 'POST') {
        await handleUpload(req, res);
        return;
      }

      if (req.url?.startsWith('/uploads/') && (req.method === 'GET' || req.method === 'HEAD')) {
        try {
          const url = new URL(req.url, 'http://localhost');
          const relativePath = decodeURIComponent(url.pathname.replace(/^\/uploads\//, ''));
          const filePath = path.resolve(uploadsRoot, relativePath);

          if (!filePath.startsWith(uploadsRoot)) {
            res.statusCode = 400;
            res.end('Invalid file path.');
            return;
          }

          const fileBuffer = await fs.readFile(filePath);
          const ext = path.extname(filePath).replace('.', '').toLowerCase();
          res.statusCode = 200;
          res.setHeader('Content-Type', contentTypeFromExt(ext));
          res.end(fileBuffer);
          return;
        } catch {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
      }

      next();
    });
  };

  return {
    name: 'local-uploads',
    async configResolved() {
      await fs.mkdir(uploadsRoot, { recursive: true });
    },
    configureServer(server: any) {
      attachMiddlewares(server.middlewares);
    },
    configurePreviewServer(server: any) {
      attachMiddlewares(server.middlewares);
    }
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), localUploadsPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
