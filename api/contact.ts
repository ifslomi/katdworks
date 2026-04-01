import { sendContactEmail, validateContactPayload, type ContactRequestBody } from './contact-email.js';
import { enforceContactSecurity, extractClientIp } from './contact-security.js';

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
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as ContactRequestBody;
    const payload = validateContactPayload(body || {});

    enforceContactSecurity({
      ip: extractClientIp(req),
      email: payload.email,
      message: payload.message,
      honeypot: body?.website,
      startedAt: Number(body?.startedAt || 0),
    });

    await sendContactEmail(payload);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send contact email.';
    const statusCode = /Please provide|Please include/i.test(message)
      ? 400
      : /Too many requests|Please wait|Duplicate message/i.test(message)
        ? 429
        : 500;

    if (statusCode === 500) {
      console.error('Contact email send failed:', error);
    }

    sendJson(res, statusCode, { error: message });
  }
}
