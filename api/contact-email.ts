import nodemailer from 'nodemailer';

export type ContactRequestBody = {
  name?: string;
  email?: string;
  message?: string;
  website?: string;
  startedAt?: number;
  submittedAt?: number;
};

export type ValidContactPayload = {
  name: string;
  email: string;
  message: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOneLine(input: unknown, maxLength: number) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function normalizeMessage(input: unknown, maxLength: number) {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function validateContactPayload(body: ContactRequestBody): ValidContactPayload {
  const name = normalizeOneLine(body?.name, 120);
  const email = normalizeOneLine(body?.email, 160).toLowerCase();
  const message = normalizeMessage(body?.message, 5000);

  if (name.length < 2) {
    throw new Error('Please provide your name.');
  }

  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('Please provide a valid email address.');
  }

  if (message.length < 10) {
    throw new Error('Please include a short message (at least 10 characters).');
  }

  return { name, email, message };
}

type EmailRuntimeConfig = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  toEmail: string;
  fromEmail: string;
};

function getEmailRuntimeConfig(env: NodeJS.ProcessEnv = process.env): EmailRuntimeConfig {
  const smtpHost = env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(env.SMTP_PORT || '465');
  const smtpSecure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : smtpPort === 465;
  const smtpUser = env.SMTP_USER || env.GMAIL_USER || '';
  const normalizedGmailPass = String(env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const smtpPass = String(env.SMTP_PASS || normalizedGmailPass || '').trim();
  const toEmail = env.CONTACT_TO_EMAIL || 'katdworks@gmail.com';
  const fromEmail = env.CONTACT_FROM_EMAIL || smtpUser || toEmail;

  if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
    throw new Error('SMTP_PORT must be a valid number.');
  }

  if (!smtpUser || !smtpPass) {
    throw new Error(
      'SMTP credentials are missing. Configure SMTP_USER and SMTP_PASS (or GMAIL_USER and GMAIL_APP_PASSWORD).'
    );
  }

  return {
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    toEmail,
    fromEmail,
  };
}

export async function sendContactEmail(payload: ValidContactPayload, env: NodeJS.ProcessEnv = process.env) {
  const config = getEmailRuntimeConfig(env);

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  const safeName = escapeHtml(payload.name);
  const safeEmail = escapeHtml(payload.email);
  const safeMessage = escapeHtml(payload.message).replace(/\n/g, '<br/>');
  const safeSentAt = escapeHtml(new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
  const safeReplySubject = encodeURIComponent(`Re: Portfolio inquiry from ${payload.name}`);
  const safeReplyBody = encodeURIComponent(`Hi ${payload.name},\n\nThanks for reaching out.\n\n`);

  return transporter.sendMail({
    from: `KatDWorks Portfolio <${config.fromEmail}>`,
    to: config.toEmail,
    replyTo: `${payload.name} <${payload.email}>`,
    subject: `New portfolio inquiry from ${payload.name}`,
    text: [
      `Name: ${payload.name}`,
      `Email: ${payload.email}`,
      '',
      payload.message,
    ].join('\n'),
    html: `<!doctype html>
      <html>
        <body style="margin:0;padding:0;background:#f4ece4;font-family:Segoe UI, Helvetica Neue, Arial, sans-serif;color:#2d1f17;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4ece4;padding:24px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;width:100%;background:#fffaf5;border-radius:22px;overflow:hidden;border:1px solid #ead8c8;box-shadow:0 18px 45px rgba(58,38,28,0.14);">
                  <tr>
                    <td style="background:linear-gradient(135deg,#3a261c 0%,#6f4a35 52%,#d9b89d 100%);padding:28px 28px 24px 28px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td>
                            <div style="display:inline-block;background:#fff3e7;color:#3a261c;border-radius:999px;padding:7px 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Katdworks Inbox</div>
                            <h1 style="margin:12px 0 6px 0;color:#fff6ed;font-size:28px;line-height:1.15;">New Portfolio Inquiry</h1>
                            <p style="margin:0;color:#f6dcc7;font-size:14px;line-height:1.5;">A new message has arrived from your KatDWorks contact form.</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:26px 28px 14px 28px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;">
                        <tr>
                          <td style="width:130px;color:#8a6751;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;vertical-align:top;">From</td>
                          <td style="font-size:15px;color:#33231a;font-weight:700;">${safeName}</td>
                        </tr>
                        <tr>
                          <td style="width:130px;color:#8a6751;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;vertical-align:top;">Email</td>
                          <td style="font-size:15px;"><a href="mailto:${safeEmail}" style="color:#5a3726;text-decoration:none;font-weight:600;">${safeEmail}</a></td>
                        </tr>
                        <tr>
                          <td style="width:130px;color:#8a6751;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;vertical-align:top;">Received</td>
                          <td style="font-size:14px;color:#624534;">${safeSentAt}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:0 28px 10px 28px;">
                      <div style="background:#fff0e2;border:1px solid #f1d8c0;border-radius:16px;padding:18px 18px 16px 18px;">
                        <p style="margin:0 0 10px 0;color:#7b5640;font-size:12px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;">Client Message</p>
                        <p style="margin:0;color:#2f2219;font-size:15px;line-height:1.68;word-break:break-word;">${safeMessage}</p>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:10px 28px 28px 28px;">
                      <a href="mailto:${safeEmail}?subject=${safeReplySubject}&body=${safeReplyBody}" style="display:inline-block;background:#3f291e;color:#fff7ef;text-decoration:none;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:700;">Reply to ${safeName}</a>
                      <p style="margin:14px 0 0 0;color:#8b6954;font-size:12px;line-height:1.5;">This message was sent from your KatDWorks Portfolio contact form and delivered securely.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>`,
  });
}
