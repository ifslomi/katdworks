type UploadResponse = {
  url: string;
  secure_url?: string;
  error?: {
    message?: string;
  };
};

type CloudinaryUploadInit = {
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  signature: string;
  timestamp: string;
  uploadUrl: string;
};

async function requestCloudinaryUploadInit(file: File, folder: string) {
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      folder,
    }),
  });

  let payload: { error?: string } & Partial<CloudinaryUploadInit> = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Upload initialization failed.');
  }

  if (!payload.apiKey || !payload.signature || !payload.timestamp || !payload.publicId || !payload.folder || !payload.uploadUrl) {
    throw new Error('Upload initialization returned incomplete data.');
  }

  return payload as CloudinaryUploadInit;
}

export async function uploadToCloudinary(
  file: File,
  folder: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const uploadInit = await requestCloudinaryUploadInit(file, folder);

  const candidateUrls = [
    uploadInit.uploadUrl,
    uploadInit.uploadUrl.replace('/raw/upload', '/auto/upload'),
    uploadInit.uploadUrl.replace('/raw/upload', '/image/upload'),
  ].filter((url, index, list) => list.indexOf(url) === index);

  const attemptUpload = (targetUrl: string) =>
    new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', targetUrl);

      xhr.upload.onprogress = (event) => {
        if (!onProgress) return;
        if (!event.lengthComputable) {
          onProgress(50);
          return;
        }
        onProgress((event.loaded / event.total) * 100);
      };

      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          let message = `Upload failed (${xhr.status}).`;
          try {
            const parsed = JSON.parse(xhr.responseText) as { error?: string | { message?: string } };
            if (typeof parsed.error === 'string' && parsed.error) {
              message = parsed.error;
            } else if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) {
              message = parsed.error.message;
            }
          } catch {
            // Keep default message when response is not JSON.
          }
          reject(new Error(message));
          return;
        }

        try {
          const response = JSON.parse(xhr.responseText) as UploadResponse;
          const fileUrl = response.secure_url || response.url;
          if (!fileUrl) {
            reject(new Error('Upload succeeded but no file URL was returned.'));
            return;
          }
          onProgress?.(100);
          resolve(fileUrl);
        } catch {
          reject(new Error('Upload response was invalid.'));
        }
      };

      xhr.onerror = () => reject(new Error(`Network error while uploading file to ${targetUrl}.`));

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', uploadInit.apiKey);
      formData.append('timestamp', uploadInit.timestamp);
      formData.append('folder', uploadInit.folder);
      formData.append('public_id', uploadInit.publicId);
      formData.append('signature', uploadInit.signature);

      xhr.send(formData);
    });

  let lastError: Error | null = null;
  for (const targetUrl of candidateUrls) {
    try {
      return await attemptUpload(targetUrl);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(lastError?.message || 'Upload failed for all Cloudinary endpoints.');
}

export const uploadToLocal = uploadToCloudinary;
