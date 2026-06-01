import { Logger } from '@nestjs/common';
import type { IEmailProvider, SendEmailOptions, SendEmailResult } from './email-provider.interface';
import { SendGridProvider } from './sendgrid.provider';
import { SmtpProvider } from './smtp.provider';

const logger = new Logger('EmailProviderFactory');

export function buildSmtpProvider(): SmtpProvider {
  return new SmtpProvider({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    fromEmail: process.env.SMTP_FROM_EMAIL ?? 'noreply@rekartmailer.io',
    fromName: process.env.SMTP_FROM_NAME ?? '',
  });
}

export function buildSendGridProvider(): SendGridProvider {
  const apiKey = process.env.SENDGRID_API_KEY ?? '';
  const fromEmail =
    process.env.SENDGRID_FROM_EMAIL ??
    process.env.SMTP_FROM_EMAIL ??
    'noreply@rekartmailer.io';
  const fromName =
    process.env.SENDGRID_FROM_NAME ?? process.env.SMTP_FROM_NAME ?? '';
  return new SendGridProvider(apiKey, fromEmail, fromName);
}

/**
 * FailoverEmailProvider — tries primary, falls back to secondary on error.
 */
export class FailoverEmailProvider implements IEmailProvider {
  private readonly logger = new Logger(FailoverEmailProvider.name);

  constructor(
    private readonly primary: IEmailProvider,
    private readonly fallback: IEmailProvider | null,
    private readonly primaryName: string,
    private readonly fallbackName: string,
  ) {}

  async send(options: SendEmailOptions): Promise<SendEmailResult & { usedProvider: string }> {
    try {
      const result = await this.primary.send(options);
      return { ...result, usedProvider: this.primaryName };
    } catch (primaryErr: unknown) {
      const primaryMsg =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      this.logger.warn(
        `[Failover] ${this.primaryName} failed: ${primaryMsg}. ` +
          (this.fallback ? `Trying ${this.fallbackName}…` : 'No fallback configured.'),
      );

      if (!this.fallback) throw primaryErr;

      const result = await this.fallback.send(options);
      return { ...result, usedProvider: this.fallbackName };
    }
  }
}

export function createEmailProvider(): FailoverEmailProvider {
  const provider = (process.env.EMAIL_PROVIDER ?? 'smtp').toLowerCase();
  const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER);
  const hasSendGrid = !!process.env.SENDGRID_API_KEY;

  if (provider === 'sendgrid' && hasSendGrid) {
    logger.log('[Email] Primary: SendGrid, Fallback: SMTP');
    return new FailoverEmailProvider(
      buildSendGridProvider(),
      hasSmtp ? buildSmtpProvider() : null,
      'sendgrid',
      'smtp',
    );
  }

  // Default: SMTP primary, SendGrid fallback (if key present)
  logger.log('[Email] Primary: SMTP' + (hasSendGrid ? ', Fallback: SendGrid' : ''));
  return new FailoverEmailProvider(
    buildSmtpProvider(),
    hasSendGrid ? buildSendGridProvider() : null,
    'smtp',
    'sendgrid',
  );
}
