import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WorkspaceBrandingDocument = WorkspaceBranding & Document;

@Schema({ timestamps: true, collection: 'workspace_brandings' })
export class WorkspaceBranding {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  workspaceId: Types.ObjectId;

  // ── Branding identity ────────────────────────────────────────────────────────
  @Prop({ type: String, default: '' })
  companyName: string;

  @Prop({ type: String, default: '' })
  logoUrl: string;

  @Prop({ type: String, default: '' })
  teamDisplayName: string;

  @Prop({ type: String, default: '' })
  website: string;

  @Prop({ type: String, default: '' })
  supportEmail: string;

  @Prop({ type: String, default: '' })
  supportPhone: string;

  @Prop({
    type: String,
    default: 'Retake Technologies FZ-LLC\nHQ: G01, Boutique Villa 9, Dubai Media City, Dubai',
  })
  footerAddress: string;

  @Prop({ type: String, default: '' })
  privacyPolicyUrl: string;

  @Prop({ type: String, default: '' })
  termsOfServiceUrl: string;

  @Prop({ type: String, default: '' })
  supportUrl: string;

  @Prop({
    type: Object,
    default: {
      facebook:  'https://facebook.com/rekartuae',
      instagram: 'https://instagram.com/rekartuae',
      tiktok:    'https://www.tiktok.com/@rekartuae',
      whatsapp:  'https://wa.me/+971585962788',
    },
  })
  socialLinks: Record<string, string>;

  // ── Core brand colors ────────────────────────────────────────────────────────
  @Prop({ type: String, default: '#6366f1' })
  primaryColor: string;

  @Prop({ type: String, default: '#8b5cf6' })
  secondaryColor: string;

  @Prop({ type: String, default: '#06b6d4' })
  accentColor: string;

  @Prop({ type: String, enum: ['default', 'solid', 'gradient'], default: 'default' })
  brandMode: 'default' | 'solid' | 'gradient';

  // ── Extended colors ──────────────────────────────────────────────────────────
  @Prop({ type: String, default: '#ffffff' })
  buttonTextColor: string;

  @Prop({ type: String, default: '#ffffff' })
  headerTextColor: string;

  @Prop({ type: String, default: '#475569' })
  bodyTextColor: string;

  @Prop({ type: String, default: '#94a3b8' })
  mutedTextColor: string;

  @Prop({ type: String, default: '#64748b' })
  footerTextColor: string;

  @Prop({ type: String, default: '#e2e8f0' })
  borderColor: string;

  @Prop({ type: String, default: '#f4f6fb' })
  emailBackgroundColor: string;

  @Prop({ type: String, default: '#ffffff' })
  cardBackgroundColor: string;

  // ── Typography ───────────────────────────────────────────────────────────────
  @Prop({ type: String, default: 'Inter' })
  headingFontFamily: string;

  @Prop({ type: String, default: 'Inter' })
  bodyFontFamily: string;

  @Prop({ type: String, default: '18' })
  headingFontSize: string;

  @Prop({ type: String, default: '14' })
  bodyFontSize: string;

  @Prop({ type: String, default: '14' })
  buttonFontSize: string;

  @Prop({ type: String, default: '1.65' })
  lineHeight: string;

  @Prop({ type: String, default: '600' })
  headingFontWeight: string;

  @Prop({ type: String, default: '400' })
  bodyFontWeight: string;

  // ── Buttons ──────────────────────────────────────────────────────────────────
  @Prop({ type: String, default: '8' })
  buttonRadius: string;

  @Prop({ type: String, default: '13px 28px' })
  buttonPadding: string;

  @Prop({ type: String, enum: ['solid', 'outline', 'soft'], default: 'solid' })
  buttonStyle: string;

  // ── Layout ───────────────────────────────────────────────────────────────────
  @Prop({ type: String, default: '600' })
  emailWidth: string;

  @Prop({ type: String, default: '32' })
  contentPadding: string;

  @Prop({ type: String, default: '24' })
  sectionSpacing: string;

  @Prop({ type: String, default: '12' })
  cardRadius: string;

  // ── Footer text ──────────────────────────────────────────────────────────────
  @Prop({ type: String, default: '' })
  footerGreetingText: string;

  @Prop({ type: String, default: '' })
  footerNote: string;

  @Prop({ type: String, default: '' })
  copyrightText: string;

  // ── Compliance / legal footer ─────────────────────────────────────────────
  /** Full custom compliance line shown at the very bottom of every email */
  @Prop({ type: String, default: '' })
  complianceText: string;

  /** Background color of the compliance strip */
  @Prop({ type: String, default: '#f8fafc' })
  complianceBgColor: string;

  /** Text color of the compliance strip */
  @Prop({ type: String, default: '#94a3b8' })
  complianceTextColor: string;

  /** Pickup / store locations shown to customers — keyed by currency (AED, INR, …). */
  @Prop({ type: Object, default: {} })
  businessLocationsByCurrency: Record<
    string,
    Array<{ id: string; label: string; address: string }>
  >;
}

export const WorkspaceBrandingSchema =
  SchemaFactory.createForClass(WorkspaceBranding);

WorkspaceBrandingSchema.index({ workspaceId: 1 }, { unique: true });
