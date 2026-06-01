import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as nodemailer from 'nodemailer';
import type {
  IEmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from './email-provider.interface';
import { formatSmtpFromAddress } from './mail-from.util';

export class SmtpProvider implements IEmailProvider {
  private readonly logger = new Logger(SmtpProvider.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly defaultFrom: string;

  constructor(config: {
    host: string;
    port: number;
    user: string;
    pass: string;
    fromEmail: string;
    fromName?: string;
  }) {
    this.defaultFrom =
      formatSmtpFromAddress(config.fromEmail, config.fromName) || config.fromEmail;

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port === 587,
      auth:
        config.user && config.pass
          ? { user: config.user, pass: config.pass }
          : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 5_000,
    });

    this.logger.log(
      `[Email] SMTP provider initialized (${config.host}:${config.port})`,
    );
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      const fileAttachments = (options.attachments ?? []).map((a) => ({
        filename: a.filename,
        path: a.storedPath,
        contentType: a.contentType,
      }));

      const inlineParts = (options.inlineCidAttachments ?? [])
        .map((a) => {
          if (a.content?.length) {
            return {
              filename: a.filename,
              content: a.content,
              contentType: a.contentType,
              cid: a.cid,
              contentDisposition: 'inline' as const,
            };
          }
          if (a.path && fs.existsSync(a.path)) {
            return {
              filename: a.filename,
              path: a.path,
              contentType: a.contentType,
              cid: a.cid,
              contentDisposition: 'inline' as const,
            };
          }
          return null;
        })
        .filter((p): p is NonNullable<typeof p> => p != null);

      const attachments = [...fileAttachments, ...inlineParts];

      const info = await this.transporter.sendMail({
        from: options.from ?? this.defaultFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
        ...(options.replyTo ? { replyTo: options.replyTo } : {}),
        ...(attachments.length ? { attachments } : {}),
      });

      this.logger.log(
        `[Email] Sent via SMTP to ${options.to} (messageId: ${info.messageId})`,
      );

      return { success: true, messageId: info.messageId as string | undefined };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'SMTP send failed';
      this.logger.error(`[Email] SMTP error: ${message}`);
      throw new Error(`SMTP: ${message}`);
    }
  }
}
