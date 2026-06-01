import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import type { MailDataRequired } from '@sendgrid/mail';
// @sendgrid/mail is a CommonJS module — require() avoids the "not callable" TS error
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sgMail = require('@sendgrid/mail') as typeof import('@sendgrid/mail');
import type {
  IEmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from './email-provider.interface';

export class SendGridProvider implements IEmailProvider {
  private readonly logger = new Logger(SendGridProvider.name);
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(apiKey: string, fromEmail: string, fromName = '') {
    sgMail.setApiKey(apiKey);
    this.fromEmail = fromEmail;
    this.fromName = (fromName || '').trim();
    this.logger.log('[Email] SendGrid provider initialized');
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const sgAttachments = (options.attachments ?? [])
      .filter((a) => fs.existsSync(a.storedPath))
      .map((a) => ({
        content: fs.readFileSync(a.storedPath).toString('base64'),
        filename: a.filename,
        type: a.contentType,
        disposition: 'attachment' as const,
      }));

    const sgInline = (options.inlineCidAttachments ?? []).flatMap((a) => {
      let raw: Buffer | null = null;
      if (a.content?.length) raw = a.content;
      else if (a.path && fs.existsSync(a.path)) raw = fs.readFileSync(a.path);
      if (!raw) return [];
      return [
        {
          content: raw.toString('base64'),
          filename: a.filename,
          type: a.contentType,
          disposition: 'inline' as const,
          content_id: a.cid,
        },
      ];
    });

    const defaultFrom =
      options.from ??
      (this.fromName
        ? { email: this.fromEmail, name: this.fromName }
        : this.fromEmail);

    const msg: MailDataRequired = {
      to: options.to,
      from: defaultFrom,
      subject: options.subject,
      html: options.html,
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      ...(sgAttachments.length || sgInline.length
        ? { attachments: [...sgAttachments, ...sgInline] }
        : {}),
    };

    try {
      const [response] = await sgMail.send(msg);
      const messageId =
        (response.headers as Record<string, string>)?.['x-message-id'] ??
        undefined;
      this.logger.log(`[Email] Sent via SendGrid to ${options.to}`);
      return { success: true, messageId };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'SendGrid send failed';
      this.logger.error(`[Email] SendGrid error: ${message}`);
      throw new Error(`SendGrid: ${message}`);
    }
  }
}
