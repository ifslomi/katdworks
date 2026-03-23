import crypto from 'node:crypto';
import path from 'node:path';

export type CloudinaryUploadRequestBody = {
  fileName?: string;
  mimeType?: string;
  folder?: string;
};

export type CloudinaryUploadInit = {
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  signature: string;
  timestamp: string;
  uploadUrl: string;
  resourceType: 'image' | 'raw' | 'auto';
};

function resourceTypeFromMime(mimeType?: string): 'image' | 'raw' | 'auto' {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('pdf')) return 'raw';
  if (normalized.startsWith('image/')) return 'image';
  return 'auto';
}

function sanitizeSegment(input: string) {
  return input.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function parseCloudinaryUrl(cloudinaryUrl: string) {
  const url = new URL(cloudinaryUrl);
  if (url.protocol !== 'cloudinary:') {
    throw new Error('CLOUDINARY_URL must use the cloudinary:// format.');
  }

  const apiKey = decodeURIComponent(url.username);
  const apiSecret = decodeURIComponent(url.password);
  const cloudName = url.hostname;

  if (!apiKey || !apiSecret || !cloudName) {
    throw new Error('CLOUDINARY_URL is missing the API key, API secret, or cloud name.');
  }

  return { apiKey, apiSecret, cloudName };
}

function createSignature(params: Record<string, string>, apiSecret: string) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== '')
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
}

export function createCloudinaryUploadInit(
  body: CloudinaryUploadRequestBody,
  cloudinaryUrl = process.env.CLOUDINARY_URL
): CloudinaryUploadInit {
  if (!cloudinaryUrl) {
    throw new Error('CLOUDINARY_URL is not configured.');
  }

  const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl(cloudinaryUrl);
  const folder = sanitizeSegment(body.folder || 'files');
  const resourceType = resourceTypeFromMime(body.mimeType);
  const originalName = body.fileName || 'upload';
  const safeNameBase = sanitizeSegment(path.parse(originalName).name) || 'upload';
  const publicId = `${Date.now()}_${safeNameBase}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signature = createSignature(
    {
      folder,
      public_id: publicId,
      timestamp,
    },
    apiSecret
  );

  return {
    apiKey,
    cloudName,
    folder,
    publicId,
    signature,
    timestamp,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    resourceType,
  };
}