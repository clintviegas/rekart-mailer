export const SELL_EMAIL_QUEUE = 'sell-email';
export const SELL_EMAIL_JOB   = 'send-sell-email';

export interface JobAttachment {
  storedFilename: string;
  originalName: string;
  mimeType: string;
  url?: string;
}

export interface SellEmailJobPayload {
  workspaceId: string;
  workflowKey: string;
  recipientEmail: string;
  subject: string;
  dynamicFieldValues: Record<string, unknown>;
  templateId: string | null;
  triggeredBy: string;
  deliveryLogId: string;
  attachments?: JobAttachment[];
  // Per-email overrides
  customSignoffName?: string;
  customFooterNote?: string;
  customGreetingText?: string;
  customHeadingColor?: string;
  customBodyTextColor?: string;
  customButtonLabel?: string;
}

export const REPAIR_EMAIL_QUEUE = 'repair-email';
export const REPAIR_EMAIL_JOB = 'send-repair-email';

export interface RepairEmailJobPayload {
  workspaceId: string;
  workflowKey: string;
  recipientEmail: string;
  subject: string;
  dynamicFieldValues: Record<string, unknown>;
  templateId: string | null;
  triggeredBy: string;
  deliveryLogId: string;
  attachments?: JobAttachment[];
  customSignoffName?: string;
  customFooterNote?: string;
  customGreetingText?: string;
  customHeadingColor?: string;
  customBodyTextColor?: string;
  customButtonLabel?: string;
}

export const RENT_EMAIL_QUEUE = 'rent-email';
export const RENT_EMAIL_JOB = 'send-rent-email';

export interface RentEmailJobPayload {
  workspaceId: string;
  workflowKey: string;
  recipientEmail: string;
  subject: string;
  dynamicFieldValues: Record<string, unknown>;
  templateId: string | null;
  triggeredBy: string;
  deliveryLogId: string;
  attachments?: JobAttachment[];
  customSignoffName?: string;
  customFooterNote?: string;
  customGreetingText?: string;
  customHeadingColor?: string;
  customBodyTextColor?: string;
  customButtonLabel?: string;
}

export const RECYCLE_EMAIL_QUEUE = 'recycle-email';
export const RECYCLE_EMAIL_JOB = 'send-recycle-email';

export interface RecycleEmailJobPayload {
  workspaceId: string;
  workflowKey: string;
  recipientEmail: string;
  subject: string;
  dynamicFieldValues: Record<string, unknown>;
  templateId: string | null;
  triggeredBy: string;
  deliveryLogId: string;
  attachments?: JobAttachment[];
  customSignoffName?: string;
  customFooterNote?: string;
  customGreetingText?: string;
  customHeadingColor?: string;
  customBodyTextColor?: string;
  customButtonLabel?: string;
}
