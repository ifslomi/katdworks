import 'dotenv/config';
import express from 'express';
import { createCloudinaryUploadInit, type CloudinaryUploadRequestBody } from './cloudinary.ts';

const app = express();
const PORT = Number(process.env.UPLOADS_PORT || 3101);

app.use(express.json({ limit: '30mb' }));

app.post('/api/upload', async (req, res) => {
  try {
    const body = req.body as CloudinaryUploadRequestBody;
    const uploadInit = createCloudinaryUploadInit(body || {});
    return res.status(200).json(uploadInit);
  } catch (error) {
    console.error('Cloudinary upload init failed:', error);
    return res.status(500).json({ error: 'Failed to prepare Cloudinary upload.' });
  }
});

async function start() {
  app.listen(PORT, () => {
    console.log(`Cloudinary upload server listening on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start upload server:', error);
  process.exit(1);
});
