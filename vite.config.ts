import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createCloudinaryUploadInit, type CloudinaryUploadRequestBody } from './server/cloudinary.ts';
import { sendContactEmail, validateContactPayload, type ContactRequestBody } from './api/contact-email.ts';
import { enforceContactSecurity, extractClientIp } from './api/contact-security.ts';
import {defineConfig, loadEnv} from 'vite';

async function readJsonBody<T>(req: any): Promise<T> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve());
    req.on('error', (error: Error) => reject(error));
  });

  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw || '{}') as T;
}

function sendJson(res: any, statusCode: number, payload: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function handleUpload(req: any, res: any, cloudinaryUrl?: string) {
  try {
    const body = await readJsonBody<CloudinaryUploadRequestBody>(req);
    const uploadInit = createCloudinaryUploadInit(body || {}, cloudinaryUrl);
    sendJson(res, 200, uploadInit);
  } catch (error) {
    console.error('Vite upload handler failed:', error);
    sendJson(res, 500, { error: 'Failed to prepare Cloudinary upload.' });
  }
}

async function handleContact(req: any, res: any, runtimeEnv?: NodeJS.ProcessEnv) {
  try {
    const body = await readJsonBody<ContactRequestBody>(req);
    const payload = validateContactPayload(body || {});

    enforceContactSecurity({
      ip: extractClientIp(req),
      email: payload.email,
      message: payload.message,
      honeypot: body?.website,
      startedAt: Number(body?.startedAt || 0),
    });

    await sendContactEmail(payload, runtimeEnv);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send contact email.';
    const statusCode = /Please provide|Please include/i.test(message)
      ? 400
      : /Too many requests|Please wait|Duplicate message/i.test(message)
        ? 429
        : 500;

    if (statusCode === 500) {
      console.error('Vite contact handler failed:', error);
    }

    sendJson(res, statusCode, { error: message });
  }
}

function localUploadsPlugin(cloudinaryUrl?: string, runtimeEnv?: NodeJS.ProcessEnv) {
  const attachMiddlewares = (middlewares: any) => {
    middlewares.use(async (req: any, res: any, next: any) => {
      if (req.url?.startsWith('/api/upload') && req.method === 'POST') {
        await handleUpload(req, res, cloudinaryUrl);
        return;
      }

      if (req.url?.startsWith('/api/contact') && req.method === 'POST') {
        await handleContact(req, res, runtimeEnv);
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
  const runtimeEnv = {
    ...process.env,
    ...env,
  } as NodeJS.ProcessEnv;

  return {
    plugins: [react(), tailwindcss(), localUploadsPlugin(env.CLOUDINARY_URL, runtimeEnv)],
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
