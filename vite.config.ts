import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createCloudinaryUploadInit, type CloudinaryUploadRequestBody } from './server/cloudinary.ts';
import {defineConfig, loadEnv} from 'vite';

async function handleUpload(req: any, res: any, cloudinaryUrl?: string) {
  try {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve());
      req.on('error', (error: Error) => reject(error));
    });

    const raw = Buffer.concat(chunks).toString('utf8');
    const body = JSON.parse(raw || '{}') as CloudinaryUploadRequestBody;
    const uploadInit = createCloudinaryUploadInit(body || {}, cloudinaryUrl);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(uploadInit));
  } catch (error) {
    console.error('Vite upload handler failed:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to prepare Cloudinary upload.' }));
  }
}

function localUploadsPlugin(cloudinaryUrl?: string) {
  const attachMiddlewares = (middlewares: any) => {
    middlewares.use(async (req: any, res: any, next: any) => {
      if (req.url?.startsWith('/api/upload') && req.method === 'POST') {
        await handleUpload(req, res, cloudinaryUrl);
        return;
      }

      next();
    });
  };

  return {
    name: 'local-uploads',
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
    plugins: [react(), tailwindcss(), localUploadsPlugin(env.CLOUDINARY_URL)],
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
