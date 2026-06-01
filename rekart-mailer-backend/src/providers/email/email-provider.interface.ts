export interface EmailAttachment {
  filename: string;         // display name in email client
  storedPath: string;       // absolute path on disk
  contentType: string;      // MIME type
}

/** Inline image for multipart/related (use in HTML as <img src="cid:...">). */
export interface InlineCidAttachment {
  cid: string;
  filename: string;
  contentType: string;
  path?: string;
  content?: Buffer;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  inlineCidAttachments?: InlineCidAttachment[];
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
}

export interface IEmailProvider {
  send(options: SendEmailOptions): Promise<SendEmailResult>;
}

export const EMAIL_PROVIDER_TOKEN = 'EMAIL_PROVIDER';
