import crypto from 'node:crypto';

type ContactSecurityInput = {
  ip: string;
  email: string;
  message: string;
  honeypot?: string;
  startedAt?: number;
};

const REQUEST_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_IP_WINDOW = 6;
const MAX_REQUESTS_PER_EMAIL_WINDOW = 4;
const MIN_SUBMIT_INTERVAL_MS = 20 * 1000;
const DUPLICATE_MESSAGE_WINDOW_MS = 30 * 60 * 1000;
const MIN_FORM_FILL_MS = 1500;

const ipHistory = new Map<string, number[]>();
const emailHistory = new Map<string, number[]>();
const duplicateMessageHistory = new Map<string, number>();

function pruneWindow(entries: number[], now: number, windowMs: number) {
  return entries.filter((value) => now - value <= windowMs);
}

function registerEvent(map: Map<string, number[]>, key: string, now: number, windowMs: number) {
  const current = map.get(key) || [];
  const next = pruneWindow(current, now, windowMs);
  next.push(now);
  map.set(key, next);
  return next;
}

function pruneDuplicateHistory(now: number) {
  for (const [key, timestamp] of duplicateMessageHistory.entries()) {
    if (now - timestamp > DUPLICATE_MESSAGE_WINDOW_MS) {
      duplicateMessageHistory.delete(key);
    }
  }
}

function createMessageFingerprint(email: string, message: string) {
  const normalizedMessage = message.trim().toLowerCase().replace(/\s+/g, ' ');
  const payload = `${email.trim().toLowerCase()}::${normalizedMessage}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

function tooFastFormFill(startedAt?: number) {
  if (!startedAt || !Number.isFinite(startedAt) || startedAt <= 0) {
    return false;
  }
  return Date.now() - startedAt < MIN_FORM_FILL_MS;
}

export function extractClientIp(req: any) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).split(',')[0].trim();
  }

  const realIp = req?.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  return String(req?.socket?.remoteAddress || 'unknown');
}

export function enforceContactSecurity(input: ContactSecurityInput) {
  const now = Date.now();

  if ((input.honeypot || '').trim().length > 0) {
    throw new Error('Too many requests. Please try again later.');
  }

  if (tooFastFormFill(input.startedAt)) {
    throw new Error('Please wait a few seconds before sending your message.');
  }

  const ipKey = input.ip || 'unknown';
  const ipEvents = registerEvent(ipHistory, ipKey, now, REQUEST_WINDOW_MS);
  const previousIpSubmit = ipEvents[ipEvents.length - 2];

  if (previousIpSubmit && now - previousIpSubmit < MIN_SUBMIT_INTERVAL_MS) {
    throw new Error('Please wait at least 20 seconds before sending another inquiry.');
  }

  if (ipEvents.length > MAX_REQUESTS_PER_IP_WINDOW) {
    throw new Error('Too many requests. Please try again in 10 minutes.');
  }

  const emailKey = input.email.trim().toLowerCase();
  const emailEvents = registerEvent(emailHistory, emailKey, now, REQUEST_WINDOW_MS);

  if (emailEvents.length > MAX_REQUESTS_PER_EMAIL_WINDOW) {
    throw new Error('Too many requests from this email. Please try again in 10 minutes.');
  }

  pruneDuplicateHistory(now);
  const fingerprint = createMessageFingerprint(emailKey, input.message);
  const lastDuplicate = duplicateMessageHistory.get(fingerprint);

  if (lastDuplicate && now - lastDuplicate < DUPLICATE_MESSAGE_WINDOW_MS) {
    throw new Error('Duplicate message detected. Please wait before sending the same inquiry again.');
  }

  duplicateMessageHistory.set(fingerprint, now);
}
