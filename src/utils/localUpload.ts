type UploadResponse = {
  url: string;
};

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadToLocal(
  file: File,
  folder: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const dataUrl = await toDataUrl(file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.setRequestHeader('Content-Type', 'application/json');

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
        let message = 'Upload failed.';
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // Keep default message when response is not JSON.
        }
        reject(new Error(message));
        return;
      }

      try {
        const response = JSON.parse(xhr.responseText) as UploadResponse;
        if (!response.url) {
          reject(new Error('Upload succeeded but no file URL was returned.'));
          return;
        }
        onProgress?.(100);
        resolve(response.url);
      } catch {
        reject(new Error('Upload response was invalid.'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading file.'));

    xhr.send(
      JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        dataUrl,
        folder
      })
    );
  });
}
