import { createCloudinaryUploadInit, type CloudinaryUploadRequestBody } from '../server/cloudinary.ts';

function sendJson(res: any, statusCode: number, payload: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as CloudinaryUploadRequestBody;
    const uploadInit = createCloudinaryUploadInit(body || {});
    sendJson(res, 200, uploadInit);
  } catch (error) {
    console.error('Cloudinary upload init failed:', error);
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Failed to prepare Cloudinary upload.',
    });
  }
}