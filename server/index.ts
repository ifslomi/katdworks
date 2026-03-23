import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = express();
const PORT = Number(process.env.UPLOADS_PORT || 3101);
const uploadsRoot = path.resolve(process.cwd(), 'uploads');

app.use(express.json({ limit: '30mb' }));
app.use('/uploads', express.static(uploadsRoot));

type UploadRequestBody = {
  fileName?: string;
  mimeType?: string;
  dataUrl?: string;
  folder?: string;
};

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

app.post('/api/upload', async (req, res) => {
  try {
    const body = req.body as UploadRequestBody;
    const rawFolder = body.folder || 'files';
    const folder = sanitizeSegment(rawFolder);
    const dataUrl = body.dataUrl;
    const mimeType = body.mimeType || 'application/octet-stream';
    const originalName = body.fileName || 'upload';

    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return res.status(400).json({ error: 'Missing or invalid data payload.' });
    }

    const parts = dataUrl.split(',');
    if (parts.length !== 2) {
      return res.status(400).json({ error: 'Malformed data URL.' });
    }

    const base64Data = parts[1];
    const buffer = Buffer.from(base64Data, 'base64');

    if (!buffer.length) {
      return res.status(400).json({ error: 'Uploaded file is empty.' });
    }

    const safeNameBase = sanitizeSegment(path.parse(originalName).name) || 'upload';
    const parsedExt = path.parse(originalName).ext.replace('.', '').toLowerCase();
    const ext = parsedExt || extensionFromMime(mimeType);
    const uniqueName = `${Date.now()}_${safeNameBase}.${ext}`;

    const folderPath = path.resolve(uploadsRoot, folder);
    await fs.mkdir(folderPath, { recursive: true });

    if (!folderPath.startsWith(uploadsRoot)) {
      return res.status(400).json({ error: 'Invalid upload target.' });
    }

    const filePath = path.resolve(folderPath, uniqueName);
    await fs.writeFile(filePath, buffer);

    const publicUrl = `/uploads/${folder}/${uniqueName}`;
    return res.status(201).json({ url: publicUrl });
  } catch (error) {
    console.error('Local upload failed:', error);
    return res.status(500).json({ error: 'Failed to store file locally.' });
  }
});

async function start() {
  await fs.mkdir(uploadsRoot, { recursive: true });
  app.listen(PORT, () => {
    console.log(`Upload server listening on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start upload server:', error);
  process.exit(1);
});
