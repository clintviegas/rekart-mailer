import apiClient from "@/lib/api";
import type { ApiResponse } from "@/types/api";
import type { Workspace } from "@/types/auth";

export interface WorkspaceBranding {
  // ── Branding identity ──────────────────────────────────────────────────────
  companyName?: string;
  teamDisplayName?: string;
  logoUrl?: string;
  website?: string;
  supportEmail?: string;
  supportPhone?: string;
  footerAddress?: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  supportUrl?: string;
  unsubscribeUrl?: string;
  socialLinks?: Record<string, string>;
  // ── Core brand colors ──────────────────────────────────────────────────────
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  brandMode?: 'default' | 'solid' | 'gradient';
  // ── Extended colors ────────────────────────────────────────────────────────
  buttonTextColor?: string;
  headerTextColor?: string;
  bodyTextColor?: string;
  mutedTextColor?: string;
  footerTextColor?: string;
  borderColor?: string;
  emailBackgroundColor?: string;
  cardBackgroundColor?: string;
  // ── Typography ─────────────────────────────────────────────────────────────
  headingFontFamily?: string;
  bodyFontFamily?: string;
  headingFontSize?: string;
  bodyFontSize?: string;
  buttonFontSize?: string;
  lineHeight?: string;
  headingFontWeight?: string;
  bodyFontWeight?: string;
  // ── Buttons ────────────────────────────────────────────────────────────────
  buttonRadius?: string;
  buttonPadding?: string;
  buttonStyle?: 'solid' | 'outline' | 'soft';
  // ── Layout ─────────────────────────────────────────────────────────────────
  emailWidth?: string;
  contentPadding?: string;
  sectionSpacing?: string;
  cardRadius?: string;
  // ── Footer text ────────────────────────────────────────────────────────────
  footerGreetingText?: string;
  footerNote?: string;
  copyrightText?: string;
  // ── Compliance footer ───────────────────────────────────────────────────────
  complianceText?: string;
  complianceBgColor?: string;
  complianceTextColor?: string;
  businessLocationsByCurrency?: Record<
    string,
    Array<{ id: string; label: string; address: string }>
  >;
}

export const DEFAULT_FOOTER_ADDRESS =
  'Retake Technologies FZ-LLC\nHQ: G01, Boutique Villa 9, Dubai Media City, Dubai';

const LEGACY_FOOTER_ADDRESS_MARKERS = [
  /123\s*trade\s*street/i,
  /mumbai\s*400001/i,
  /trade\s*street,\s*mumbai/i,
];

export function resolveFooterAddress(raw?: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return DEFAULT_FOOTER_ADDRESS;
  if (LEGACY_FOOTER_ADDRESS_MARKERS.some((re) => re.test(trimmed))) {
    return DEFAULT_FOOTER_ADDRESS;
  }
  return trimmed;
}

export const SUPPORTED_FONTS = [
  'Inter', 'Poppins', 'Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Nunito',
] as const;
export type SupportedFont = typeof SUPPORTED_FONTS[number];

export const DEFAULT_BRANDING: Required<Omit<WorkspaceBranding, 'companyName' | 'teamDisplayName' | 'logoUrl' | 'website' | 'supportEmail' | 'supportPhone' | 'footerAddress' | 'privacyPolicyUrl' | 'termsOfServiceUrl' | 'supportUrl' | 'unsubscribeUrl' | 'socialLinks' | 'complianceText' | 'complianceBgColor' | 'complianceTextColor'>> = {
  primaryColor:         '#0056D2',
  secondaryColor:       '#6DA5F3',
  accentColor:          '#8BB8F6',
  brandMode:            'gradient',
  buttonTextColor:      '#ffffff',
  headerTextColor:      '#ffffff',
  bodyTextColor:        '#334155',
  mutedTextColor:       '#64748b',
  footerTextColor:      '#1e293b',
  borderColor:          '#d4e5fc',
  emailBackgroundColor: '#eef5ff',
  cardBackgroundColor:  '#ffffff',
  headingFontFamily:    'Inter',
  bodyFontFamily:       'Inter',
  headingFontSize:      '20',
  bodyFontSize:         '15',
  buttonFontSize:       '15',
  lineHeight:           '1.65',
  headingFontWeight:    '700',
  bodyFontWeight:       '400',
  buttonRadius:         '10',
  buttonPadding:        '14px 32px',
  buttonStyle:          'solid',
  emailWidth:           '600',
  contentPadding:       '36',
  sectionSpacing:       '28',
  cardRadius:           '14',
  footerGreetingText:   '',
  footerNote:           '',
  copyrightText:        '',
};

export function getBrandingValue<K extends keyof typeof DEFAULT_BRANDING>(
  branding: WorkspaceBranding | null | undefined,
  key: K,
): (typeof DEFAULT_BRANDING)[K] {
  const v = branding?.[key];
  return (v as (typeof DEFAULT_BRANDING)[K]) ?? DEFAULT_BRANDING[key];
}

export interface BrandTheme {
  primary: string;
  secondary: string;
  accent: string;
  mode: 'default' | 'solid' | 'gradient';
}

export const DEFAULT_BRAND_THEME: BrandTheme = {
  primary: '#0056D2',
  secondary: '#6DA5F3',
  accent: '#8BB8F6',
  mode: 'gradient',
};

export function brandingToBrandTheme(branding?: WorkspaceBranding | null): BrandTheme {
  return {
    primary: branding?.primaryColor || DEFAULT_BRAND_THEME.primary,
    secondary: branding?.secondaryColor || DEFAULT_BRAND_THEME.secondary,
    accent: branding?.accentColor || DEFAULT_BRAND_THEME.accent,
    mode: branding?.brandMode || DEFAULT_BRAND_THEME.mode,
  };
}

/** Compute header background CSS value from brand theme */
export function getHeaderBg(theme: BrandTheme): string {
  return theme.mode === 'gradient'
    ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`
    : theme.primary;
}

/** Mix hex color with white (factor=1 → white, factor=0 → original) */
export function lightenColor(hex: string, factor: number): string {
  const clean = hex.replace('#', '').padEnd(6, '0');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * factor);
  return `#${[mix(r), mix(g), mix(b)].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

export const workspaceService = {
  getCurrent: () =>
    apiClient
      .get<ApiResponse<Workspace & { companyLogoUrl?: string | null; branding?: WorkspaceBranding | null }>>("/workspace/current")
      .then((r) => r.data.data),

  getBranding: () =>
    apiClient
      .get<ApiResponse<WorkspaceBranding>>("/workspace/branding")
      .then((r) => r.data.data),

  updateBranding: (data: Partial<WorkspaceBranding>) =>
    apiClient
      .put<ApiResponse<WorkspaceBranding>>("/workspace/branding", data)
      .then((r) => r.data.data),

  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append("logo", file);
    return apiClient
      .post<ApiResponse<{ logoUrl: string; branding: WorkspaceBranding }>>("/workspace/branding/logo", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data.data);
  },

  removeLogo: () =>
    apiClient
      .delete<ApiResponse<null>>("/workspace/branding/logo")
      .then((r) => r.data),
};

// ── Sell attachment types ─────────────────────────────────────────────────────
export interface SellAttachmentInfo {
  storedFilename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export const sellAttachmentService = {
  upload: (files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return apiClient
      .post<ApiResponse<{ accepted: SellAttachmentInfo[]; rejected: string[] }>>(
        "/sell/attachments/upload",
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      )
      .then((r) => r.data.data);
  },

  delete: (storedFilename: string) =>
    apiClient
      .delete<ApiResponse<null>>(`/sell/attachments/${storedFilename}`)
      .then((r) => r.data),
};
