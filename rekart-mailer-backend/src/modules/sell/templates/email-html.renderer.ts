import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import type { InlineCidAttachment } from '../../../providers/email/email-provider.interface';
import { displayDateValue as dv } from '../../../common/date-format';
import { formatDisplayMoney } from '../../../common/format-display-money';
const juice = require('juice') as (html: string, opts?: Record<string, unknown>) => string;

// ?? Render cache ??????????????????????????????????????????????????????????????
// Caches the fully-inlined HTML (before tracking pixel injection) keyed by a
// SHA-256 hash of (workflowKey + dynamicValues + opts-minus-tracking).
// juice() + branding processing is expensive; this avoids re-running it for
// repeated preview calls with identical inputs (e.g. staff refreshing a modal).
const RENDER_CACHE_MAX  = 120;
const RENDER_CACHE_TTL  = 5 * 60 * 1000; // 5 minutes

interface CacheEntry { html: string; expiresAt: number }
const renderCache = new Map<string, CacheEntry>();

function cacheKey(
  workflowKey: string,
  dynamicValues: Record<string, unknown>,
  opts: Record<string, unknown>,
): string {
  const payload = JSON.stringify({ workflowKey, dynamicValues, opts });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function cacheGet(key: string): string | null {
  const entry = renderCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { renderCache.delete(key); return null; }
  return entry.html;
}

function cacheSet(key: string, html: string): void {
  // Evict oldest entry when at capacity (simple LRU approximation)
  if (renderCache.size >= RENDER_CACHE_MAX) {
    renderCache.delete(renderCache.keys().next().value as string);
  }
  renderCache.set(key, { html, expiresAt: Date.now() + RENDER_CACHE_TTL });
}

/** Stable CID for workspace logo ? referenced in HTML as `cid:?` */
export const BRANDING_LOGO_CID = 'workspace-brand-logo@rekart';
/** Stable CID for hero mascot illustration in sell emails */
export const WORKFLOW_MASCOT_CID = 'hero-mascot@rekart';

function candidateLogoDirs(): string[] {
  const set = new Set<string>();
  set.add(path.normalize(path.join(process.cwd(), 'uploads', 'logos')));
  // Works for both src/.../templates and dist/.../templates
  set.add(
    path.normalize(path.join(__dirname, '..', '..', '..', '..', 'uploads', 'logos')),
  );
  return [...set];
}

/** Resolve `uploads/logos/filename` to an existing file path (cwd-independent). */
export function findLogoFileOnDisk(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe || safe === '.' || safe === '..') return null;
  for (const dir of candidateLogoDirs()) {
    const full = path.join(dir, safe);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function extractLogoFilenameFromStoredUrl(logoUrl: string): string | null {
  const m = logoUrl.match(/uploads[/\\]logos[/\\]([^?#]+)/i);
  if (m?.[1]) return path.basename(decodeURIComponent(m[1]));
  if (logoUrl.startsWith('/uploads/logos/')) {
    return path.basename(logoUrl.split('?')[0]);
  }
  return null;
}

const LOCAL_HOST_RE = /\b(localhost|127\.0\.0\.1)\b/i;

function isLocalHostUrl(url: string): boolean {
  try {
    return LOCAL_HOST_RE.test(new URL(url).hostname);
  } catch {
    return LOCAL_HOST_RE.test(url);
  }
}

/**
 * Public HTTPS URL for <img src> ? avoids CID parts so Gmail/Outlook don?t show a logo ?attachment?.
 * Returns null if only localhost / missing backend / or SVG (Gmail won?t render remote SVG in img).
 */
export function hostedLogoUrlForOutbound(storedLogoUrl: string): string | null {
  const raw = storedLogoUrl?.trim() ?? '';
  if (!raw) return null;

  let candidate: string | null = null;
  if (raw.startsWith('https://') && !isLocalHostUrl(raw)) {
    candidate = raw.split('?')[0];
  } else if (raw.startsWith('http://') && !isLocalHostUrl(raw)) {
    candidate = raw.split('?')[0];
  } else {
    const fname = extractLogoFilenameFromStoredUrl(raw);
    const backend = (process.env.BACKEND_BASE_URL ?? '').replace(/\/$/, '');
    if (
      fname &&
      backend &&
      /^https:\/\//i.test(backend) &&
      !LOCAL_HOST_RE.test(backend)
    ) {
      candidate = `${backend}/uploads/logos/${encodeURIComponent(fname)}`;
    } else if (raw.startsWith('/uploads/logos/') && backend && /^https:\/\//i.test(backend) && !LOCAL_HOST_RE.test(backend)) {
      candidate = `${backend}${raw.split('?')[0]}`;
    }
  }

  if (!candidate) return null;
  if (/\.svg(\?|$)/i.test(candidate)) return null;

  return candidate;
}

function mimeForStoredLogo(fname: string): string {
  const ext = path.extname(fname).toLowerCase().replace('.', '');
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'ico') return 'image/x-icon';
  return 'image/jpeg';
}

/**
 * Makes near-white pixels transparent so a rectangular white matte behind a wordmark
 * disappears on colored email headers. Set EMAIL_LOGO_WHITE_KNOCKOUT=false to skip.
 * EMAIL_LOGO_WHITE_THRESHOLD (default 248) ? RGB channels ? this become transparent.
 */
async function knockOutNearWhiteBackground(input: Buffer): Promise<Buffer> {
  if ((process.env.EMAIL_LOGO_WHITE_KNOCKOUT ?? 'true').toLowerCase() === 'false') {
    return sharp(input).png({ quality: 92 }).toBuffer();
  }
  const threshold = Math.min(
    255,
    Math.max(200, Number(process.env.EMAIL_LOGO_WHITE_THRESHOLD ?? 248)),
  );
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4 || width === 0 || height === 0) {
    return sharp(input).png({ quality: 92 }).toBuffer();
  }
  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      px[i + 3] = 0;
    }
  }
  return sharp(px, {
    raw: { width, height, channels: 4 },
  })
    .png({ quality: 92, compressionLevel: 9, effort: 6 })
    .toBuffer();
}

/**
 * Recolor visible logo pixels to white so wordmarks + taglines stay readable
 * on colored header bars (#398ff7). Set EMAIL_LOGO_HEADER_WHITE=false to skip.
 */
async function recolorLogoForColoredHeader(input: Buffer): Promise<Buffer> {
  if ((process.env.EMAIL_LOGO_HEADER_WHITE ?? 'true').toLowerCase() === 'false') {
    return input;
  }
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4 || width === 0 || height === 0) {
    return input;
  }
  const px = Buffer.from(data);
  const minAlpha = 20;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a >= minAlpha) {
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = Math.max(a, 220);
    }
  }
  return sharp(px, {
    raw: { width, height, channels: 4 },
  })
    .png({ quality: 92, compressionLevel: 9, effort: 6 })
    .toBuffer();
}

async function prepareLogoForColoredHeader(input: Buffer): Promise<Buffer> {
  const knocked = await knockOutNearWhiteBackground(input);
  return recolorLogoForColoredHeader(knocked);
}

export interface PreparedBrandingLogo {
  logoSrc: string;
  inlineCidAttachments?: InlineCidAttachment[];
}

/**
 * preview = data URI / public URL (works in browser preview).
 * outbound = hosted HTTPS <img> when possible (no attachment chip in Gmail);
 *            else CID inline with a generic filename + SMTP inline disposition.
 */
export async function prepareBrandingLogoForEmail(
  storedLogoUrl: string | null | undefined,
  mode: 'preview' | 'outbound',
): Promise<PreparedBrandingLogo> {
  const logoUrl = storedLogoUrl?.trim() ?? '';
  if (!logoUrl) return { logoSrc: '' };

  if (mode === 'preview') {
    return { logoSrc: await resolveLogoForEmail(logoUrl) };
  }

  const forceCid =
    (process.env.EMAIL_LOGO_USE_CID ?? '').toLowerCase() === 'true' ||
    (process.env.EMAIL_LOGO_USE_HOSTED_URL ?? '').toLowerCase() === 'false';

  const fname = extractLogoFilenameFromStoredUrl(logoUrl);
  const ext0 = fname ? path.extname(fname).toLowerCase() : '';
  const needsRasterCid = ext0 === '.svg' || ext0 === '.webp';

  if (!forceCid && !needsRasterCid) {
    const hosted = hostedLogoUrlForOutbound(logoUrl);
    if (hosted) {
      const knFname = extractLogoFilenameFromStoredUrl(logoUrl);
      if (knFname) {
        const knPath = findLogoFileOnDisk(path.basename(knFname));
        if (knPath) {
          try {
            const raw = await fs.promises.readFile(knPath);
            const knocked = await prepareLogoForColoredHeader(raw);
            return {
              logoSrc: `cid:${BRANDING_LOGO_CID}`,
              inlineCidAttachments: [
                {
                  cid: BRANDING_LOGO_CID,
                  filename: 'brand-logo.png',
                  contentType: 'image/png',
                  content: knocked,
                },
              ],
            };
          } catch {
            /* use hosted URL */
          }
        }
      }
      return { logoSrc: hosted };
    }
  }

  if (fname) {
    const filePath = findLogoFileOnDisk(fname);
    if (filePath) {
      const ext = path.extname(fname).toLowerCase();
      const inlineFilename =
        ext === '.png'
          ? 'brand-logo.png'
          : ext === '.gif'
            ? 'brand-logo.gif'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'brand-logo.jpg'
              : 'brand-logo.png';
      if (ext === '.svg' || ext === '.webp') {
        try {
          const buf = await prepareLogoForColoredHeader(
            await sharp(filePath)
              .resize({ width: 560, height: 240, fit: 'inside', withoutEnlargement: true })
              .png({ quality: 92 })
              .toBuffer(),
          );
          return {
            logoSrc: `cid:${BRANDING_LOGO_CID}`,
            inlineCidAttachments: [
              {
                cid: BRANDING_LOGO_CID,
                filename: 'brand-logo.png',
                contentType: 'image/png',
                content: buf,
              },
            ],
          };
        } catch {
          /* fall through to data-uri fallback */
        }
      } else {
        try {
          const raw = await fs.promises.readFile(filePath);
          const knocked = await prepareLogoForColoredHeader(raw);
          return {
            logoSrc: `cid:${BRANDING_LOGO_CID}`,
            inlineCidAttachments: [
              {
                cid: BRANDING_LOGO_CID,
                filename: 'brand-logo.png',
                contentType: 'image/png',
                content: knocked,
              },
            ],
          };
        } catch {
          return {
            logoSrc: `cid:${BRANDING_LOGO_CID}`,
            inlineCidAttachments: [
              {
                cid: BRANDING_LOGO_CID,
                filename: inlineFilename,
                contentType: mimeForStoredLogo(fname),
                path: filePath,
              },
            ],
          };
        }
      }
    }
  }

  return { logoSrc: await resolveLogoForEmail(logoUrl) };
}

/**
 * Logo for outbound email: prefer inline data URI from disk (works everywhere);
 * else HTTPS public URL; never leave localhost URLs in src (they break in Gmail).
 * SVG files are rasterized to PNG ? most clients (e.g. Gmail) do not display SVG in img tags.
 */
export async function resolveLogoForEmail(logoUrl: string): Promise<string> {
  if (!logoUrl?.trim()) return '';

  const tryReadAsDataUri = async (filename: string): Promise<string | null> => {
    try {
      const safeName = path.basename(filename);
      if (!safeName || safeName === '.' || safeName === '..') return null;
      const filePath = findLogoFileOnDisk(safeName);
      if (!filePath) return null;

      if (path.extname(safeName).toLowerCase() === '.svg') {
        try {
          const buf = await prepareLogoForColoredHeader(
            await sharp(filePath)
              .resize({ width: 560, height: 240, fit: 'inside', withoutEnlargement: true })
              .png({ quality: 92 })
              .toBuffer(),
          );
          return `data:image/png;base64,${buf.toString('base64')}`;
        } catch {
          return null;
        }
      }

      const data = fs.readFileSync(filePath);
      try {
        const knocked = await prepareLogoForColoredHeader(data);
        return `data:image/png;base64,${knocked.toString('base64')}`;
      } catch {
        return `data:${mimeForStoredLogo(safeName)};base64,${data.toString('base64')}`;
      }
    } catch {
      return null;
    }
  };

  const uploadMatch = logoUrl.match(/uploads[/\\]logos[/\\]([^?#]+)/i);
  const filenameFromUrl = uploadMatch?.[1]
    ? decodeURIComponent(uploadMatch[1])
    : null;

  if (filenameFromUrl) {
    const inlined = await tryReadAsDataUri(filenameFromUrl);
    if (inlined) return inlined;

    // Never use a raw SVG URL in email ? clients like Gmail won't render it in <img>.
    const extFromPath = path.extname(filenameFromUrl).toLowerCase();
    if (extFromPath === '.svg') return '';

    const backend = (process.env.BACKEND_BASE_URL ?? '').replace(/\/$/, '');
    if (backend && !/\/localhost|\b127\.0\.0\.1\b/i.test(backend)) {
      return `${backend}/uploads/logos/${path.basename(filenameFromUrl)}`;
    }
  }

  // Already a remote URL (CDN / production)
  if (logoUrl.startsWith('https://')) return logoUrl;

  // http:// ? only pass through if not local loopback (some staging hosts use http)
  if (logoUrl.startsWith('http://')) {
    try {
      const h = new URL(logoUrl).hostname;
      if (h === 'localhost' || h === '127.0.0.1') return '';
      return logoUrl;
    } catch {
      return '';
    }
  }

  // Relative /uploads/... ? map to public backend if configured
  if (logoUrl.startsWith('/uploads/logos/')) {
    const fname = path.basename(logoUrl);
    const inlined = await tryReadAsDataUri(fname);
    if (inlined) return inlined;
    const backend = (process.env.BACKEND_BASE_URL ?? '').replace(/\/$/, '');
    if (backend && !/\/localhost|\b127\.0\.0\.1\b/i.test(backend)) {
      return `${backend}${logoUrl.split('?')[0]}`;
    }
  }

  return '';
}

// ?? Register helpers ??????????????????????????????????????????????????????????
Handlebars.registerHelper('or', (a: unknown, b: unknown) => a ?? b);
Handlebars.registerHelper('currency', (val: unknown, symbol = '?') => {
  const n = Number(val);
  return isNaN(n) ? String(val ?? '') : `${symbol}${n.toLocaleString('en-IN')}`;
});
Handlebars.registerHelper('upper', (val: unknown) =>
  String(val ?? '').toUpperCase(),
);

// ?? Tracking / compliance options ?????????????????????????????????????????????
export interface TrackingOptions {
  trackingPixelUrl: string;
  clickBaseUrl: string;
}

export interface ComplianceOptions {
  unsubscribeUrl: string;
  workspaceName: string;
  /** Fully custom compliance text ? replaces the default "You are receiving?" line */
  customComplianceText?: string;
  complianceBgColor?: string;
  complianceTextColor?: string;
}

// ?? Design tokens (full white-label email design system) ??????????????????????
export interface DesignTokens {
  // Core brand
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  brandMode: 'default' | 'solid' | 'gradient';
  // Extended colors
  buttonTextColor: string;
  headerTextColor: string;
  bodyTextColor: string;
  mutedTextColor: string;
  footerTextColor: string;
  borderColor: string;
  emailBackgroundColor: string;
  cardBackgroundColor: string;
  // Typography
  headingFontFamily: string;
  bodyFontFamily: string;
  headingFontSize: string;
  bodyFontSize: string;
  buttonFontSize: string;
  lineHeight: string;
  headingFontWeight: string;
  bodyFontWeight: string;
  // Buttons
  buttonRadius: string;
  buttonPadding: string;
  buttonStyle: string;
  // Layout
  emailWidth: string;
  contentPadding: string;
  sectionSpacing: string;
  cardRadius: string;
  // Footer text
  footerGreetingText: string;
  footerNote: string;
  copyrightText: string;
}

/** Rekart premium palette — all accents derive from header blue */
const REKART_TOP_BAR    = '#398ff7';  // Header nav bar + solid buttons/cards
const REKART_BRAND_LIGHT = '#70aef9'; // Light tint of header (badges, labels, links)
const REKART_BRAND_SOFT  = '#b4d4fc'; // Soft tint of header (borders, surfaces)
const REKART_NAVY        = '#0B1426'; // Dark detail-card body (contrast)

export const DEFAULT_DESIGN_TOKENS: DesignTokens = {
  primaryColor:         REKART_TOP_BAR,
  secondaryColor:       REKART_BRAND_LIGHT,
  accentColor:          REKART_BRAND_SOFT,
  brandMode:            'solid',
  buttonTextColor:      '#ffffff',
  headerTextColor:      '#ffffff',
  bodyTextColor:        '#1e293b',
  mutedTextColor:       '#64748b',
  footerTextColor:      '#475569',
  borderColor:          '#e2e8f0',
  emailBackgroundColor: '#eef2ff',
  cardBackgroundColor:  '#ffffff',
  headingFontFamily:    'Inter',
  bodyFontFamily:       'Inter',
  headingFontSize:      '26',
  bodyFontSize:         '15',
  buttonFontSize:       '14',
  lineHeight:           '1.65',
  headingFontWeight:    '800',
  bodyFontWeight:       '400',
  buttonRadius:         '10',
  buttonPadding:        '14px 28px',
  buttonStyle:          'solid',
  emailWidth:           '600',
  contentPadding:       '32',
  sectionSpacing:       '20',
  cardRadius:           '16',
  footerGreetingText:   'Best regards,',
  footerNote:           '',
  copyrightText:        '',
};

/** Legacy BrandTheme ? kept for backward compat with frontend types */
export interface BrandTheme {
  primary: string;
  secondary: string;
  accent: string;
  mode: 'default' | 'solid' | 'gradient';
}

export const DEFAULT_BRAND_THEME: BrandTheme = {
  primary: DEFAULT_DESIGN_TOKENS.primaryColor,
  secondary: DEFAULT_DESIGN_TOKENS.secondaryColor,
  accent: DEFAULT_DESIGN_TOKENS.accentColor,
  mode: 'default',
};

/** Per-email overrides (applied on top of workspace design tokens) */
export interface PerEmailOverrides {
  customSignoffName?: string;
  customFooterNote?: string;
  customGreetingText?: string;
  customHeadingColor?: string;
  customBodyTextColor?: string;
  customButtonLabel?: string;
}

/** Footer/signoff options */
export interface FooterOptions extends PerEmailOverrides {
  teamDisplayName?: string;
  companyAddress?: string;
  supportPhone?: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  supportUrl?: string;
  website?: string;
  socialLinks?: Record<string, string>;
}

/** Default footer address for Rekart sell emails. */
export const DEFAULT_FOOTER_ADDRESS =
  'Retake Technologies FZ-LLC\nHQ: G01, Boutique Villa 9, Dubai Media City, Dubai';

const LEGACY_FOOTER_ADDRESS_MARKERS = [
  /123\s*trade\s*street/i,
  /mumbai\s*400001/i,
  /trade\s*street,\s*mumbai/i,
];

/** Replace known placeholder addresses saved in older workspaces. */
export function resolveFooterAddress(raw?: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return DEFAULT_FOOTER_ADDRESS;
  if (LEGACY_FOOTER_ADDRESS_MARKERS.some((re) => re.test(trimmed))) {
    return DEFAULT_FOOTER_ADDRESS;
  }
  return trimmed;
}

/** Rekart official social profiles — used when workspace branding has no overrides. */
export const DEFAULT_SOCIAL_LINKS: Record<string, string> = {
  facebook:  'https://facebook.com/rekartuae',
  instagram: 'https://instagram.com/rekartuae',
  tiktok:    'https://www.tiktok.com/@rekartuae',
  whatsapp:  'https://wa.me/+971585962788',
};

const SOCIAL_LINK_ORDER = ['facebook', 'instagram', 'tiktok', 'whatsapp'] as const;

const SOCIAL_LINK_META: Record<
  (typeof SOCIAL_LINK_ORDER)[number],
  { alt: string }
> = {
  facebook:  { alt: 'Facebook' },
  instagram: { alt: 'Instagram' },
  tiktok:    { alt: 'TikTok' },
  whatsapp:  { alt: 'WhatsApp' },
};

function socialIconCid(key: string): string {
  return `social-icon-${key}@rekart`;
}

function candidateSocialIconDirs(): string[] {
  const set = new Set<string>();
  set.add(path.normalize(path.join(process.cwd(), 'public', 'social')));
  set.add(path.normalize(path.join(__dirname, '..', '..', '..', '..', 'public', 'social')));
  return [...set];
}

function findSocialIconFileOnDisk(key: string): string | null {
  const candidates = [`${key}-dark.png`, `${key}-dark.svg`, `${key}.png`, `${key}.svg`];
  for (const name of candidates) {
    const safe = path.basename(name);
    if (!safe || safe === '.' || safe === '..') continue;
    for (const dir of candidateSocialIconDirs()) {
      const full = path.join(dir, safe);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

async function readSocialIconPngBuffer(filePath: string): Promise<Buffer | null> {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const raw = await fs.promises.readFile(filePath);
    if (ext === '.svg') {
      return sharp(raw).resize(28, 28, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    }
    return raw;
  } catch {
    return null;
  }
}

const socialIconDataUriCache = new Map<string, string>();

function getSocialIconDataUriSync(key: string): string {
  const cached = socialIconDataUriCache.get(key);
  if (cached) return cached;
  const filePath = findSocialIconFileOnDisk(key);
  if (!filePath) return '';
  try {
    const ext = path.extname(filePath).toLowerCase();
    const data = fs.readFileSync(filePath);
    const uri =
      ext === '.svg'
        ? `data:image/svg+xml;base64,${data.toString('base64')}`
        : `data:image/png;base64,${data.toString('base64')}`;
    socialIconDataUriCache.set(key, uri);
    return uri;
  } catch {
    return '';
  }
}

export interface PreparedSocialIcons {
  iconSrcs: Record<string, string>;
  inlineCidAttachments?: InlineCidAttachment[];
}

/** preview = data URI; outbound = CID inline (Gmail blocks data: URIs in email). */
export async function prepareSocialIconsForEmail(
  mode: 'preview' | 'outbound',
  linkKeys: readonly string[] = SOCIAL_LINK_ORDER,
): Promise<PreparedSocialIcons> {
  const iconSrcs: Record<string, string> = {};
  const inlineCidAttachments: InlineCidAttachment[] = [];

  for (const key of linkKeys) {
    const filePath = findSocialIconFileOnDisk(key);
    if (!filePath) continue;
    try {
      const content = await readSocialIconPngBuffer(filePath);
      if (!content) continue;
      if (mode === 'preview') {
        iconSrcs[key] = `data:image/png;base64,${content.toString('base64')}`;
      } else {
        const cid = socialIconCid(key);
        iconSrcs[key] = `cid:${cid}`;
        inlineCidAttachments.push({
          cid,
          filename: `${key}-dark.png`,
          contentType: 'image/png',
          content,
        });
      }
    } catch {
      // skip missing/unreadable icon
    }
  }

  return {
    iconSrcs,
    inlineCidAttachments: inlineCidAttachments.length ? inlineCidAttachments : undefined,
  };
}

function resolveSocialLinks(overrides?: Record<string, string>): Record<string, string> {
  const merged = { ...DEFAULT_SOCIAL_LINKS, ...(overrides ?? {}) };
  return Object.fromEntries(
    Object.entries(merged).filter(([, url]) => String(url ?? '').trim()),
  );
}

function socialLinkIconCell(
  key: string,
  url: string,
  iconSrc: string,
  clickBaseUrl?: string,
): string {
  const meta = SOCIAL_LINK_META[key as (typeof SOCIAL_LINK_ORDER)[number]];
  if (!meta || !iconSrc) return '';
  const href = clickBaseUrl ? wrapClickUrl(url, clickBaseUrl) : url;
  return (
    `<td align="center" valign="middle" style="padding:0 3px;height:14px;line-height:0;">` +
    `<a href="${href}" title="${meta.alt}" style="text-decoration:none;display:inline-block;line-height:0;">` +
    `<img src="${iconSrc}" alt="${meta.alt}" width="14" height="14" ` +
    `style="display:block;width:14px;height:14px;border:0;vertical-align:middle;" />` +
    `</a></td>`
  );
}

function buildSocialLinksHtml(
  links: Record<string, string>,
  iconSrcs: Record<string, string>,
  clickBaseUrl?: string,
): string {
  const cells = SOCIAL_LINK_ORDER
    .filter((key) => links[key]?.trim())
    .map((key) => socialLinkIconCell(
      key,
      links[key].trim(),
      iconSrcs[key] || getSocialIconDataUriSync(key),
      clickBaseUrl,
    ))
    .filter(Boolean)
    .join('');
  if (!cells) return '';
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:5px auto 0;">` +
    `<tr>` +
    `<td valign="middle" align="right" style="padding:0 5px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;` +
    `font-size:7px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;white-space:nowrap;line-height:1;">Follow us</td>` +
    `<td valign="middle" align="left" style="padding:0;line-height:0;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
    `<tr style="line-height:0;">${cells}</tr></table>` +
    `</td></tr></table>`
  );
}

// ?? Color utilities ???????????????????????????????????????????????????????????
function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '#000000').replace('#', '').padEnd(6, '0');
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

function lighten(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex(
    Math.round(r + (255 - r) * factor),
    Math.round(g + (255 - g) * factor),
    Math.round(b + (255 - b) * factor),
  );
}

function darken(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex(
    Math.round(r * (1 - factor)),
    Math.round(g * (1 - factor)),
    Math.round(b * (1 - factor)),
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
}

/** WCAG relative luminance for sRGB hex (0 = black, 1 = white). */
function relativeLuminance(hex: string): number {
  const [r0, g0, b0] = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = lin(r0);
  const g = lin(g0);
  const b = lin(b0);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Pick compliance strip bg/text/link so small text stays readable in all clients. */
function resolveComplianceStripColors(
  tokens: DesignTokens,
  requestedBg?: string,
  requestedText?: string,
): { bg: string; text: string; link: string } {
  const softBg = lighten(tokens.primaryColor, 0.96);
  const bgRaw = (requestedBg && requestedBg.trim()) || softBg;
  const textRaw =
    (requestedText && requestedText.trim()) || tokens.mutedTextColor;
  const lumBg = relativeLuminance(bgRaw);
  const lumText = relativeLuminance(textRaw);

  if (lumBg < 0.45) {
    return {
      bg: bgRaw,
      text: '#f1f5f9',
      link: '#bfdbfe',
    };
  }

  if (Math.abs(lumBg - lumText) < 0.18) {
    const text = lumBg > 0.55 ? '#1e293b' : '#f8fafc';
    const link = lumBg > 0.55 ? tokens.primaryColor : '#e0f2fe';
    return { bg: bgRaw, text, link };
  }

  return {
    bg: bgRaw,
    text: textRaw,
    link: tokens.primaryColor,
  };
}

function injectComplianceStripStyles(
  css: string,
  colors: { bg: string; text: string; link: string },
): string {
  return css
    .replace(/__COMPLIANCE_BG__/g, colors.bg)
    .replace(/__COMPLIANCE_TEXT__/g, colors.text)
    .replace(/__COMPLIANCE_LINK__/g, colors.link);
}

// ?? Font utilities ????????????????????????????????????????????????????????????
const FONT_STACKS: Record<string, string> = {
  Inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  Poppins: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  Roboto: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  'Open Sans': "'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  Montserrat: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  Lato: "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  Nunito: "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
};

function fontStack(name: string): string {
  return FONT_STACKS[name] || FONT_STACKS['Inter'];
}

function buildFontImport(_heading: string, _body: string): string {
  // Intentionally empty: external <link> stylesheets are stripped or cause odd behavior
  // in many clients (Gmail, etc.). Fonts fall back to stacks in inline CSS.
  return '';
}

/** Hero mascot PNGs are 375×125 (3:1) — size for all sell templates. */
const HERO_MASCOT_WIDTH  = 280;
const HERO_MASCOT_HEIGHT = 93;

// ?? Full dynamic CSS builder ??????????????????????????????????????????????????
function buildEmailCss(
  t: DesignTokens,
  overrides?: { headingColor?: string; bodyTextColor?: string },
): string {
  const topBarBg   = REKART_TOP_BAR;
  const navy       = REKART_NAVY;
  const brandBlue  = REKART_TOP_BAR;
  const brandLight = lighten(brandBlue, 0.28);
  const brandSoft  = lighten(brandBlue, 0.62);
  const brandBodyBg = lighten(brandBlue, 0.92);
  const primary    = brandBlue;
  const accentText = brandLight;
  const bodyFont   = fontStack(t.bodyFontFamily);
  const headingFont = fontStack(t.headingFontFamily);
  const bRadius    = `${t.buttonRadius}px`;
  const cRadius    = `${t.cardRadius}px`;
  const emailW     = `${t.emailWidth}px`;
  const cPad       = `${t.contentPadding}px`;
  const spacing    = `${t.sectionSpacing}px`;
  const surfaceBorder = lighten(primary, 0.82);
  const gridBg     = '#f8fafc';
  const headingColor = overrides?.headingColor || navy;
  const bodyColor  = overrides?.bodyTextColor || '#475569';

  let btnPrimaryCSS: string;
  if (t.buttonStyle === 'outline') {
    btnPrimaryCSS = `background:transparent;color:${primary};border:2px solid ${primary};`;
  } else {
    btnPrimaryCSS = `background:${primary};color:#ffffff;border:none;box-shadow:0 4px 14px ${hexToRgba(primary,0.35)};`;
  }

  return `
* { box-sizing:border-box; margin:0; padding:0; }
body { background-color:${t.emailBackgroundColor}; font-family:${bodyFont}; -webkit-font-smoothing:antialiased; color:${bodyColor}; line-height:${t.lineHeight}; }
table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { border:0; display:block; outline:none; -ms-interpolation-mode:bicubic; }
.wrapper { max-width:${emailW}; margin:24px auto; padding:0 12px 40px; }
.card { background:${t.cardBackgroundColor}; border-radius:${cRadius}; overflow:hidden; border:1px solid ${surfaceBorder}; box-shadow:0 16px 48px ${hexToRgba(primary,0.08)},0 4px 16px rgba(11,20,38,0.06); }

/* Top nav bar */
.top-bar { background:${topBarBg}; padding:16px ${cPad}; }
.top-bar-logo img { max-height:42px;width:auto;max-width:200px; }
.top-bar-text { color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em; }
.top-bar-label { font-size:11px;font-weight:800;color:#ffffff;letter-spacing:0.1em;text-transform:uppercase;text-shadow:0 1px 3px rgba(0,0,0,0.12); }

/* Hero section */
.hero { background:linear-gradient(180deg,#f8faff 0%,#ffffff 100%); padding:28px ${cPad} 24px; border-bottom:1px solid ${lighten(primary,0.88)}; }
.status-badge { display:inline-block;background:#ffffff;border:1.5px solid ${brandSoft};color:${accentText};font-size:10px;font-weight:800;padding:6px 14px;border-radius:999px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px; }
.hero-headline { font-family:${headingFont};font-size:${t.headingFontSize}px;font-weight:${t.headingFontWeight};color:${headingColor};line-height:1.25;letter-spacing:-0.03em;margin-bottom:10px; }
.hero-subtext { font-size:${t.bodyFontSize}px;color:${bodyColor};line-height:${t.lineHeight};max-width:300px; }
.hero-mascot-col { vertical-align:middle;padding:0 2px 0 6px; }
.hero-mascot-wrap { width:100%; }
.hero-mascot-img { display:block;width:100%;max-width:${HERO_MASCOT_WIDTH}px;height:auto;object-fit:contain;border:0;margin:0 auto; }

/* Progress tracker */
.progress-wrap { padding:20px ${cPad}; background:#ffffff; border-bottom:1px solid ${lighten(primary,0.90)}; }
.progress-step { text-align:center;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.04em; }
.progress-step.active { color:${accentText}; }
.progress-dot { width:28px;height:28px;border-radius:50%;margin:0 auto 6px;line-height:28px;font-size:11px;font-weight:800;background:#e2e8f0;color:#94a3b8; }
.progress-dot.active { background:${primary};color:#ffffff;box-shadow:0 2px 8px ${hexToRgba(primary,0.4)}; }
.progress-line { height:2px;background:#e2e8f0;margin-top:14px; }

/* Body content area */
.body { padding:${cPad}; background:#ffffff; }

/* Detail card — blue header + light brand body */
.detail-card { border-radius:14px;overflow:hidden;margin-bottom:${spacing};border:1px solid ${brandSoft}; }
.detail-header { background:${primary};padding:12px 18px;color:#ffffff;font-size:13px;font-weight:700; }
.detail-header-sub { font-size:12px;font-weight:500;opacity:0.85; }
.detail-body { background:${brandBodyBg};padding:16px 18px;color:${navy}; }
.detail-device-name { font-size:16px;font-weight:800;color:${navy};letter-spacing:-0.02em;margin-bottom:4px; }
.detail-device-meta { font-size:12px;color:${t.mutedTextColor};line-height:1.5; }
.detail-amount { font-size:18px;font-weight:800;color:${navy};text-align:right;white-space:nowrap; }

/* Info table card */
.info-card { background:#ffffff;border:1px solid ${surfaceBorder};border-radius:14px;overflow:hidden;margin-bottom:${spacing}; }
.info-card-title { background:${gridBg};padding:11px 18px;font-size:10px;font-weight:800;color:${darken(primary,0.1)};text-transform:uppercase;letter-spacing:0.12em;border-bottom:1px solid ${surfaceBorder}; }
.info-table { width:100%;border-collapse:collapse;table-layout:auto; }
.info-table td { padding:12px 18px;font-size:14px;border-bottom:1px solid #f1f5f9;vertical-align:top; }
.info-table td.label { color:${t.mutedTextColor};font-weight:500;font-size:13px;width:38%;white-space:nowrap; }
.info-table td.value { color:${navy};font-weight:600;font-size:14px;line-height:1.45;text-align:right;letter-spacing:0; }
.info-table td.value-rich { white-space:normal;word-wrap:break-word;overflow:visible;padding-top:12px;padding-bottom:14px; }
.info-table tr:last-child td { border-bottom:0; }

/* Info grid (2-col cards like reference) */
.info-grid { width:100%;margin-bottom:${spacing};border-collapse:separate;border-spacing:10px; }
.info-grid-cell { background:${gridBg};border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;vertical-align:top; }
.info-grid-label { font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px; }
.info-grid-value { font-size:14px;font-weight:600;color:${navy};line-height:1.4;letter-spacing:0; }
.info-grid-sub { font-size:12px;color:${t.mutedTextColor};margin-top:4px;line-height:1.4; }

/* Amount highlight */
.highlight-box { background:#ffffff;border:1px solid ${surfaceBorder};border-radius:14px;padding:24px 20px;text-align:center;margin-bottom:${spacing}; }
.highlight-label { font-size:10px;font-weight:800;color:${accentText};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px; }
.highlight-value { font-size:36px;font-weight:800;color:${navy};letter-spacing:-0.03em;line-height:1.1; }
.highlight-sub { font-size:13px;color:${t.mutedTextColor};margin-top:8px; }

/* Pickup hero card */
.pickup-card { border-radius:14px;overflow:hidden;margin-bottom:${spacing};border:1px solid ${brandSoft}; }
.pickup-card-header { background:${primary};padding:11px 18px;font-size:10px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:0.12em; }
.pickup-card-body { background:${brandBodyBg};padding:20px 18px;color:${navy}; }
.pickup-when { font-size:20px;font-weight:800;line-height:1.25;margin-bottom:8px;color:${navy}; }
.pickup-where { font-size:14px;color:${navy};line-height:1.5;margin-bottom:8px; }
.pickup-agent { font-size:13px;color:${t.mutedTextColor}; }
.pickup-card-note { margin:14px 0 0;font-size:12px;color:${t.mutedTextColor};border-top:1px solid ${brandSoft};padding-top:12px; }

/* Alerts */
.alert-box { border-radius:12px;padding:14px 16px;margin-bottom:${spacing};font-size:14px;line-height:1.6;border:1px solid transparent; }
.alert-info { background:#eff6ff;border-color:#bfdbfe;color:#1e40af; }
.alert-success { background:#ecfdf5;border-color:#bbf7d0;color:#14532d; }
.alert-warning { background:#fffbeb;border-color:#fde68a;color:#92400e; }

/* CTA buttons */
.cta-button-table { width:100%;max-width:480px;margin:0 auto ${spacing};border-collapse:separate;border-spacing:10px;table-layout:fixed; }
.cta-button-table td { vertical-align:middle;padding:0; }
.cta-btn { display:inline-block;padding:${t.buttonPadding};border-radius:${bRadius};font-size:${t.buttonFontSize}px;font-weight:700;text-decoration:none;font-family:${bodyFont};letter-spacing:0.01em;text-align:center;min-height:48px;line-height:1.3;box-sizing:border-box;width:100%; }
.cta-primary { ${btnPrimaryCSS}color:#ffffff !important; }
.cta-secondary { background:#ffffff;color:${navy};border:2px solid #e2e8f0; }
.cta-success { background:${primary};color:#ffffff !important;border:none;box-shadow:0 4px 14px ${hexToRgba(primary,0.35)}; }
.cta-danger { background:#ffffff;color:#dc2626;border:2px solid #fecaca; }

/* Reminder banner */
.reminder-banner { border-radius:12px;overflow:hidden;margin-bottom:${spacing};background:#fffbeb;border:1px solid #fde68a; }
.reminder-banner-inner { padding:14px 16px; }
.reminder-banner-title { font-size:10px;font-weight:800;color:#b45309;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px; }
.reminder-banner-text { font-size:14px;color:#78350f;line-height:1.6; }

/* Footer — full-width band, polished */
.footer { padding:0;background:#f8fafc;border-top:1px solid ${brandSoft}; }
.footer-services-bar { background:${lighten(brandBlue,0.93)};padding:6px 2px;border-bottom:1px solid ${brandSoft}; }
.footer-services-table { width:100%;table-layout:fixed;border-collapse:collapse; }
.footer-service-col { padding:0;vertical-align:top; }
.footer-service-inner { margin:0 auto;border-collapse:collapse; }
.footer-service-icon-cell { font-size:11px;line-height:1;padding:0 0 2px;font-style:normal;font-weight:400;text-transform:none;letter-spacing:0; }
.footer-service-label { font-size:6px;font-weight:700;color:#475569;line-height:1.1;letter-spacing:0;text-transform:uppercase;white-space:nowrap;text-align:center; }
.footer-body { padding:10px 12px 12px;text-align:center;background:#f8fafc; }
.footer-signoff-card { background:#ffffff;border:1px solid ${brandSoft};border-radius:10px;padding:12px 16px;margin:0; }
.footer-greeting { font-size:12px;color:#64748b;margin:0;line-height:1.35; }
.footer-signoff { font-size:13px;font-weight:700;color:#0f172a;margin:2px 0 0;line-height:1.3; }
.footer-divider { border:0;border-top:1px solid #e8eef5;margin:8px 0 6px;height:0;line-height:0;font-size:0; }
.footer-meta { font-size:10px;color:#64748b;line-height:1.45;margin:0 0 2px; }
.footer-link { color:${primary};text-decoration:none;font-weight:600;font-size:10px; }
.footer-bottom-line { font-size:9px;color:#94a3b8;line-height:1.45;margin:10px 0 0; }
.footer-social { margin:0;line-height:1;text-align:center; }
.compliance-footer { text-align:center;padding:7px 12px;background:#eef2f7;border-top:1px solid #e2e8f0; }
.compliance-text { font-size:9px;color:#64748b;line-height:1.4;margin:0; }
.compliance-text a,.compliance-link { color:${primary} !important;text-decoration:none;font-weight:600; }
.compliance-text strong { color:#475569;font-weight:600; }
`.trim();
}

// ?? Click-tracking URL wrapper ????????????????????????????????????????????????
function wrapClickUrl(href: string, clickBaseUrl: string): string {
  if (!href || href === '#' || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return href;
  }
  try {
    new URL(href);
    return `${clickBaseUrl}?url=${encodeURIComponent(href)}`;
  } catch {
    return href;
  }
}

// ── Hero headlines per step (reference-style punchy copy) ─────────────────────
const HERO_HEADLINES: Record<string, string> = {
  'request-received':          'We received your sell request!',
  'request-received-reminder': 'Still waiting for your confirmation',
  'pickup-scheduled':          'Your pickup is confirmed!',
  'pickup-scheduled-reminder': 'Reminder: pickup coming up',
  'inspection-underway':       'Inspection in progress',
  'offer-ready':               'Your offer is ready!',
  'offer-ready-reminder':      'Your offer is still waiting',
  'payment-sent':              'Payment sent successfully!',
  'completed':                 'Transaction complete!',
  'device-reship':             'Your device is on its way back',
};

const SELL_PROGRESS_STEPS = [
  { key: 'request-received',    label: 'Request' },
  { key: 'pickup-scheduled',    label: 'Pickup' },
  { key: 'inspection-underway', label: 'Inspect' },
  { key: 'offer-ready',         label: 'Offer' },
  { key: 'payment-sent',        label: 'Payment' },
  { key: 'completed',           label: 'Done' },
];

function progressStepIndex(workflowKey: string): number {
  const base = workflowKey.replace(/-reminder$/, '');
  if (base === 'device-reship') return 3;
  const idx = SELL_PROGRESS_STEPS.findIndex((s) => s.key === base);
  return idx >= 0 ? idx : 0;
}

function stepProgressHtml(workflowKey: string, primary: string): string {
  if (workflowKey === 'device-reship') return '';
  const activeIdx = progressStepIndex(workflowKey);
  const cells = SELL_PROGRESS_STEPS.map((step, i) => {
    const active = i <= activeIdx;
    const isCurrent = i === activeIdx;
    return `
      <td align="center" style="width:${Math.floor(100 / SELL_PROGRESS_STEPS.length)}%;vertical-align:top;padding:0 2px;">
        <div class="progress-dot${isCurrent ? ' active' : ''}" style="${active && !isCurrent ? `background:${lighten(primary,0.75)};color:${primary};` : ''}">${i + 1}</div>
        <div class="progress-step${isCurrent ? ' active' : ''}">${step.label}</div>
      </td>`;
  }).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="progress-wrap">
      <tr><td style="padding:20px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
      </td></tr>
    </table>`;
}

/** Render hero mascot at full column width (same size on every workflow step). */
function heroMascotHtml(mascotSrc: string, alt: string): string {
  if (!mascotSrc) return '';
  const safeAlt = escapeHtmlEntities(alt);
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="hero-mascot-wrap">` +
    `<tr><td align="center" valign="middle">` +
    `<img src="${mascotSrc}" alt="${safeAlt}" width="${HERO_MASCOT_WIDTH}" height="${HERO_MASCOT_HEIGHT}" class="hero-mascot-img" style="display:block;width:100%;max-width:${HERO_MASCOT_WIDTH}px;min-width:220px;height:auto;border:0;margin:0 auto;" />` +
    `</td></tr></table>`
  );
}

const FOOTER_SERVICE_WIDTH = +(100 / 7).toFixed(2);

/** Email-safe footer service cell — icon above label, centered (Outlook/Gmail safe). */
function footerServiceCell(iconEntity: string, label: string): string {
  return (
    `<td align="center" valign="top" class="footer-service-col" width="${FOOTER_SERVICE_WIDTH}%" style="width:${FOOTER_SERVICE_WIDTH}%;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" align="center" class="footer-service-inner">` +
    `<tr><td align="center" class="footer-service-icon-cell">${iconEntity}</td></tr>` +
    `<tr><td align="center" class="footer-service-label">${label}</td></tr>` +
    `</table></td>`
  );
}

const FOOTER_SERVICES_ROW = [
  footerServiceCell('&#128722;', 'Buy'),
  footerServiceCell('&#128176;', 'Sell'),
  footerServiceCell('&#128295;', 'Repair'),
  footerServiceCell('&#128260;', 'Trade-In'),
  footerServiceCell('&#128737;', 'Insurance'),
  footerServiceCell('&#128197;', 'Rent'),
  footerServiceCell('&#9851;', 'Recycle'),
].join('');

// ── Base shell Handlebars template ────────────────────────────────────────────
const BASE_SHELL = Handlebars.compile(`<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
  <title>{{subject}}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  {{{fontImport}}}
  <style>
    {{{emailCss}}}
    @media only screen and (max-width:600px) {
      .wrapper { padding:0 8px 24px !important; }
      .hero { padding:22px 18px 20px !important; }
      .body { padding:20px 18px !important; }
      .hero-headline { font-size:22px !important; }
      .hero-mascot-col { display:none !important; }
      .cta-btn { display:block !important;width:100% !important; }
      .cta-button-table tr { display:block !important; }
      .cta-button-table td { display:block !important;width:100% !important;padding:5px 0 !important; }
      .info-grid-cell { display:block !important;width:100% !important; }
      .footer-services-bar { padding:4px 0 !important; }
      .footer-service-col { padding:0 !important; }
      .footer-service-icon-cell { font-size:9px !important;padding-bottom:1px !important; }
      .footer-service-label { font-size:4.5px !important;line-height:1 !important;letter-spacing:0 !important; }
    }
  </style>
</head>
<body>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="wrapper">
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card">

        <!-- Top nav bar -->
        <tr>
          <td class="top-bar">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td align="left" valign="middle">
                {{#if logoUrl}}
                <span class="top-bar-logo"><img src="{{{logoUrl}}}" alt="{{workspaceName}}" /></span>
                {{else}}
                <span class="top-bar-text">{{workspaceName}}</span>
                {{/if}}
              </td>
              <td align="right" valign="middle">
                <span class="top-bar-label">Sell Journey</span>
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Hero section -->
        <tr>
          <td class="hero">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td valign="middle" class="hero-copy-col" style="width:50%;padding-right:8px;">
                <span class="status-badge">&#10003; {{stepBadge}}</span>
                <p class="hero-headline">{{heroHeadline}}</p>
                <p class="hero-subtext">{{bodyText}}</p>
              </td>
              <td class="hero-mascot-col" valign="middle" align="center" style="width:50%;">
                {{{heroMascotHtml}}}
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Progress tracker -->
        <tr><td>{{{stepProgressHtml}}}</td></tr>

        <!-- Content blocks -->
        <tr>
          <td class="body">
            {{{contentBlocks}}}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="footer">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td class="footer-services-bar">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="footer-services-table">
                    <tr>
                      ${FOOTER_SERVICES_ROW}
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="footer-body">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="footer-signoff-card">
                    <tr>
                      <td align="center">
                        <p class="footer-greeting">{{footerGreeting}}</p>
                        <p class="footer-signoff">{{signoffName}}</p>
                        {{#if footerNote}}
                        <p class="footer-meta" style="font-style:italic;margin-top:4px;">{{{footerNote}}}</p>
                        {{/if}}
                        {{#if companyAddress}}
                        <hr class="footer-divider" />
                        <p class="footer-meta">{{{companyAddress}}}{{#if supportPhone}} &nbsp;&middot;&nbsp; {{supportPhone}}{{/if}}</p>
                        {{/if}}
                        {{#if hasFooterLinks}}
                        <p class="footer-meta" style="margin-top:2px;">
                          {{#if privacyPolicyUrl}}<a href="{{privacyPolicyUrl}}" class="footer-link">Privacy Policy</a>{{/if}}
                          {{#if showPrivacyDot}} &nbsp;&middot;&nbsp; {{/if}}
                          {{#if termsOfServiceUrl}}<a href="{{termsOfServiceUrl}}" class="footer-link">Terms</a>{{/if}}
                          {{#if showTermsDot}} &nbsp;&middot;&nbsp; {{/if}}
                          {{#if supportUrl}}<a href="{{supportUrl}}" class="footer-link">Support</a>{{/if}}
                        </p>
                        {{/if}}
                        {{#if socialLinksHtml}}
                        <div class="footer-social">{{{socialLinksHtml}}}</div>
                        {{/if}}
                      </td>
                    </tr>
                  </table>
                  <p class="footer-bottom-line">Rehome 100M devices by 2030 &mdash; UAE&apos;s #1 certified renewed electronics store.<br />{{copyrightLine}}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Compliance -->
        <tr>
          <td class="compliance-footer">
            <p class="compliance-text">{{{complianceBlock}}}</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`);

// ?? Per-workflow content block renderers ??????????????????????????????????????
type FieldData = Record<string, string>;

/** Signed / computed keys from journey pipeline ? not customer form fields */
const INTERNAL_JOURNEY_FIELD_KEYS = new Set([
  'trackUrl',
  'rescheduleUrl',
  'acceptUrl',
  'declineUrl',
  'receiptUrl',
  'reviewUrl',
  'rateUrl',
  'supportActionUrl',
  'formattedAmount',
  'customMessage',
  'customMessages',
  'reshipTrackingUrl',
  /** Omitted from offer table ? do not surface in ?More details?. */
  'deviceGrade',
  'requestAckGeneration',
  'offerGeneration',
  'collectionUrl',
]);

/** Frontend sends storageCapacity / deviceCondition; older data may use storage / condition */
function storageDisplay(f: FieldData): string {
  const a = f.storage?.trim();
  const b = f.storageCapacity?.trim();
  return a || b || '';
}

function conditionDisplay(f: FieldData): string {
  const a = f.condition?.trim();
  const b = f.deviceCondition?.trim();
  return a || b || '';
}

/** Legacy `estimatedPrice` or new min/max range (currency prefix when `f.currency` set). */
function estimatedValueDisplay(f: FieldData): string {
  const cur = f.currency?.trim() ? `${f.currency.trim()} ` : '';
  const min = f.estimatedPriceMin?.trim();
  const max = f.estimatedPriceMax?.trim();
  const leg = f.estimatedPrice?.trim();
  if (min && max) return `${cur}${min} – ${max}`;
  if (min) return `${cur}${min}`;
  if (max) return `${cur}${max}`;
  if (leg) return `${cur}${leg}`;
  return '';
}

function humanizeFieldKey(key: string): string {
  const s = key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  if (!s) return key;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Any dynamicData not already listed in the main table (omit internal URLs etc.) */
function infoTableRemainingFields(f: FieldData, alreadyShown: Set<string>): string {
  const rows: [string, string][] = [];
  for (const [key, val] of Object.entries(f)) {
    if (alreadyShown.has(key) || INTERNAL_JOURNEY_FIELD_KEYS.has(key)) continue;
    const s = String(val ?? '').trim();
    if (!s) continue;
    rows.push([humanizeFieldKey(key), s]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  if (!rows.length) return '';
  return infoTable('More details', rows);
}

const INFO_TABLE_VALUE_INLINE_STYLE =
  `color:${REKART_NAVY};font-weight:600;font-size:14px;line-height:1.4;text-align:right;letter-spacing:0;` +
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;";

/** Right-column value — inline styles for Gmail/Outlook. Multi-line cells wrap normally. */
function infoTableValueHtml(value: string, compactBottom = false): string {
  const v = String(value ?? '').trim();
  const content = v || '&mdash;';
  const hasMarkup = /<[^>]+>|&#\w+;|&mdash;/.test(content);
  const safe = hasMarkup ? content : escapeHtmlEntities(content);
  const compactStyle = compactBottom ? 'padding-bottom:4px;border-bottom:0;' : '';
  if (hasMarkup) {
    return (
      `<td class="value value-rich" align="right" valign="top" style="${INFO_TABLE_VALUE_INLINE_STYLE}${compactStyle}` +
      `white-space:normal;word-wrap:break-word;overflow:visible;line-height:1.45;">${safe}</td>`
    );
  }
  return (
    `<td class="value" align="right" valign="middle" style="${INFO_TABLE_VALUE_INLINE_STYLE}${compactStyle}white-space:nowrap;">${safe}</td>`
  );
}

type InfoTableFootnote = { fullWidthNote: string };
type InfoTableRow = [string, string] | [string, string, InfoTableFootnote];

function infoTable(title: string, rows: InfoTableRow[]): string {
  const cells = rows
    .map((row) => {
      const label = row[0];
      const value = row[1];
      const footnote =
        row.length === 3 && typeof row[2] === 'object' && row[2] !== null && 'fullWidthNote' in row[2]
          ? row[2].fullWidthNote
          : undefined;
      const labelExtra = footnote ? ' style="padding-bottom:4px;border-bottom:0;"' : '';
      const noteRow = footnote
        ? `<tr><td colspan="2" style="padding:0 18px 12px;font-size:11px;line-height:1.55;color:#64748b;font-weight:400;text-align:left;border-bottom:1px solid #f1f5f9;">${escapeHtmlEntities(footnote)}</td></tr>`
        : '';
      return `<tr>
        <td class="label"${labelExtra}>${escapeHtmlEntities(label)}</td>
        ${infoTableValueHtml(value, !!footnote)}
      </tr>${noteRow}`;
    })
    .join('');
  return `
    <div class="info-card">
      <div class="info-card-title">${escapeHtmlEntities(title)}</div>
      <table class="info-table" role="presentation" width="100%"><tbody>${cells}</tbody></table>
    </div>`;
}

/** 2-column info grid (reference-style cards) */
function infoGrid(items: { label: string; value: string; sub?: string }[]): string {
  const pairs: typeof items[] = [];
  for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2));
  const rows = pairs.map((pair) => {
    const cells = pair.map((item) => `
      <td class="info-grid-cell" width="50%" valign="top">
        <p class="info-grid-label">${escapeHtmlEntities(item.label)}</p>
        <p class="info-grid-value" style="color:${REKART_NAVY};font-weight:600;font-size:14px;line-height:1.4;letter-spacing:0;margin:0;">${escapeHtmlEntities(item.value) || '&mdash;'}</p>
        ${item.sub ? `<p class="info-grid-sub">${escapeHtmlEntities(item.sub)}</p>` : ''}
      </td>`).join('');
    const pad = pair.length === 1 ? '<td width="50%"></td>' : '';
    return `<tr>${cells}${pad}</tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="info-grid"><tbody>${rows}</tbody></table>`;
}

function highlight(label: string, value: string, subText?: string): string {
  const sub = subText
    ? `<p class="highlight-sub">${escapeHtmlEntities(subText)}</p>`
    : '';
  return `
    <div class="highlight-box">
      <p class="highlight-label">${label}</p>
      <p class="highlight-value">${value}</p>
      ${sub}
    </div>`;
}

function ctaRow(
  buttons: { label: string; href: string; style?: string }[],
  clickBaseUrl?: string,
  tokens?: DesignTokens,
): string {
  const primaryBg    = REKART_TOP_BAR;
  const bRadiusRaw   = tokens?.buttonRadius ?? '8';
  const bRadiusNum   = parseInt(String(bRadiusRaw).replace(/px/gi, ''), 10);
  const arcPct       = Math.round((Number.isFinite(bRadiusNum) && bRadiusNum > 0 ? bRadiusNum : 8) / 2);
  const msoBtnW      = 208;
  const msoBtnH      = 48;

  const colPct = Math.floor(100 / Math.max(1, buttons.length));
  const cells = buttons
    .map((b) => {
      const href = clickBaseUrl ? wrapClickUrl(b.href || '#', clickBaseUrl) : (b.href || '#');
      const style = b.style ?? 'primary';
      const fillColor =
        style === 'success'   ? '#16a34a'
        : style === 'danger'  ? '#dc2626'
        : style === 'secondary' ? '#f8fafc'
        : primaryBg;
      const textColor = style === 'secondary' ? '#475569' : '#ffffff';
      const mso = `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:office" href="${href}" style="height:${msoBtnH}px;v-text-anchor:middle;width:${msoBtnW}px;" arcsize="${arcPct}%" stroke="f" fillcolor="${fillColor}"><w:anchorlock/><center style="color:${textColor};font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">${b.label}</center></v:roundrect><![endif]-->`;
      const anchorStyle =
        style === 'secondary'
          ? `background:#f8fafc;color:#475569;border:2px solid #e2e8f0;`
          : style === 'danger'
            ? `background:#ffffff;color:#dc2626;border:2px solid #fecaca;`
            : `background:${fillColor};color:#ffffff;border:none;`;
      const anchor = `<!--[if !mso]><!--><a href="${href}" class="cta-btn cta-${style}" style="${anchorStyle}text-decoration:none;display:inline-block;width:100%;box-sizing:border-box;">${b.label}</a><!--<![endif]-->`;
      return `<td align="center" valign="middle" width="${colPct}%">${mso}${anchor}</td>`;
    })
    .join('');

  return `<table role="presentation" class="cta-button-table" cellpadding="0" cellspacing="0" align="center" width="100%"><tr>${cells}</tr></table>`;
}

const ALERT_ICON_HTML: Record<'info' | 'success' | 'warning', string> = {
  info:
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" role="img" aria-hidden="true" style="display:block;">' +
    '<circle cx="12" cy="12" r="9" fill="#2563eb"/>' +
    '<path stroke="#ffffff" stroke-width="2" stroke-linecap="round" d="M12 10v6"/>' +
    '<circle cx="12" cy="7.5" r="1.1" fill="#ffffff"/>' +
    '</svg>',
  success:
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" role="img" aria-hidden="true" style="display:block;">' +
    '<circle cx="12" cy="12" r="9" fill="#10b981"/>' +
    '<path stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M8 12.5 10.8 15.2 16 9"/>' +
    '</svg>',
  warning:
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" role="img" aria-hidden="true" style="display:block;">' +
    '<path fill="#f59e0b" d="M12 3.5 2.5 20h19L12 3.5Z"/>' +
    '<path stroke="#ffffff" stroke-width="2" stroke-linecap="round" d="M12 9v4.5"/>' +
    '<circle cx="12" cy="16.5" r="1.1" fill="#ffffff"/>' +
    '</svg>',
};

function alertBox(message: string, type: 'info' | 'success' | 'warning' = 'info'): string {
  const icon = ALERT_ICON_HTML[type] ?? ALERT_ICON_HTML.info;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="alert-box alert-${type}" style="margin-bottom:var(--sp,20px);">
    <tr>
      <td style="width:28px;vertical-align:top;padding-right:10px;font-size:16px;line-height:1.4;">${icon}</td>
      <td style="vertical-align:top;font-size:14px;line-height:1.6;">${message}</td>
    </tr>
  </table>`;
}

function deviceCard(f: FieldData, amountRight?: string): string {
  const st   = storageDisplay(f);
  const cond = conditionDisplay(f);
  const meta = [f.deviceBrand, st, cond]
    .filter(Boolean)
    .map((p) => escapeHtmlEntities(String(p).trim()))
    .join(' · ');
  const reqId = f.requestId?.trim() || '';
  const date  = dv(f.requestDate)?.trim() || dv(f.pickupDate)?.trim() || '';
  const headerLeft  = reqId ? `Request #${escapeHtmlEntities(reqId)}` : 'Your Device';
  const headerRight = date ? escapeHtmlEntities(date) : '';
  const amountCell  = amountRight
    ? `<td valign="middle" align="right" style="white-space:nowrap;padding-left:12px;">
         <p class="detail-amount">${amountRight}</p>
       </td>`
    : '';

  return `
    <div class="detail-card">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td class="detail-header">
            <table role="presentation" width="100%"><tr>
              <td align="left">${headerLeft}</td>
              ${headerRight ? `<td align="right" class="detail-header-sub">${headerRight}</td>` : '<td></td>'}
            </tr></table>
          </td>
        </tr>
        <tr>
          <td class="detail-body">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td valign="middle">
                <p class="detail-device-name">${escapeHtmlEntities(f.deviceName || 'Your Device')}</p>
                ${meta ? `<p class="detail-device-meta">${meta}</p>` : ''}
              </td>
              ${amountCell}
            </tr></table>
          </td>
        </tr>
      </table>
    </div>`;
}

function divider(): string {
  return '<hr class="divider" />';
}

// ?? Pickup / inspection field aliases (workflow builder vs journey form) ?????
function pickupTimeDisplay(f: FieldData): string {
  const a = f.pickupTime?.trim();
  const b = f.pickupTimeSlot?.trim();
  return a || b || '';
}

function agentPhoneDisplay(f: FieldData): string {
  const a = f.agentPhone?.trim();
  const b = f.agentContact?.trim();
  return a || b || '';
}

function pickupWhenLine(f: FieldData): string {
  const d = dv(f.pickupDate)?.trim() || '';
  const t = pickupTimeDisplay(f);
  return t ? `${d} · ${t}` : d;
}

function pickupWhereLine(f: FieldData): string {
  const name = f.customerName?.trim();
  const addr = f.pickupAddress?.trim();
  if (name && addr) return `${name} · ${addr}`;
  return addr || name || '';
}

function pickupHeroCard(f: FieldData, _t?: DesignTokens): string {
  const when  = pickupWhenLine(f);
  const where = pickupWhereLine(f);
  const agent = f.agentName?.trim();
  const phone = agentPhoneDisplay(f);
  const agentLine = [agent, phone].filter(Boolean).join(' · ');

  return `
    <div class="pickup-card">
      <div class="pickup-card-header">&#128205; Pickup Confirmation</div>
      <div class="pickup-card-body">
        <p class="pickup-when">${escapeHtmlEntities(when)}</p>
        <p class="pickup-where">${escapeHtmlEntities(where)}</p>
        ${agentLine ? `<p class="pickup-agent">Agent: ${escapeHtmlEntities(agentLine)}</p>` : ''}
        <p class="pickup-card-note">
          Our agent will call or message you before arriving.
        </p>
      </div>
    </div>`;
}

function escapeHtmlEntities(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function footerAddressHtml(raw: string): string {
  return String(raw ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => escapeHtmlEntities(line))
    .join('<br/>');
}

/** Optional per-step note from the dashboard ? shown above workflow body blocks. */
function customMessageCallout(f: FieldData): string {
  const t = f.customMessage?.trim();
  if (!t) return '';
  const safe = escapeHtmlEntities(t).replace(/\n/g, '<br/>');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin-bottom:20px;border-radius:14px;overflow:hidden;background:linear-gradient(150deg,#eff6ff 0%,#f8faff 100%);border:1.5px solid #bfdbfe;">
      <tr>
        <td style="width:4px;background:linear-gradient(180deg,#3b82f6 0%,#2563eb 100%);"></td>
        <td style="padding:16px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
          <p style="margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#1d4ed8;">&#128172; Message from our team</p>
          <p style="margin:0;font-size:14px;line-height:1.65;color:#1e3a5f;">${safe}</p>
        </td>
      </tr>
    </table>`;
}

// ── Mascot illustration helper ────────────────────────────────────────────────
function candidateMascotDirs(): string[] {
  const set = new Set<string>();
  set.add(path.normalize(path.join(process.cwd(), 'public', 'mascots')));
  set.add(path.normalize(path.join(__dirname, '..', '..', '..', '..', 'public', 'mascots')));
  return [...set];
}

function findMascotFileOnDisk(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe || safe === '.' || safe === '..') return null;
  for (const dir of candidateMascotDirs()) {
    const p = path.normalize(path.join(dir, safe));
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function workflowMascotMeta(workflowKey: string): { file: string; alt: string } | null {
  const base = workflowKey.replace(/-reminder$/, '');
  return WORKFLOW_MASCOTS[workflowKey] ?? WORKFLOW_MASCOTS[base] ?? null;
}

export interface PreparedMascot {
  mascotSrc: string;
  inlineCidAttachments?: InlineCidAttachment[];
}

/** preview = data URI; outbound = CID inline (Gmail blocks data: URIs in email). */
export async function prepareMascotForEmail(
  workflowKey: string,
  mode: 'preview' | 'outbound',
): Promise<PreparedMascot> {
  const meta = workflowMascotMeta(workflowKey);
  if (!meta) return { mascotSrc: '' };

  const filePath = findMascotFileOnDisk(meta.file);
  if (!filePath) return { mascotSrc: '' };

  try {
    const content = await fs.promises.readFile(filePath);
    if (mode === 'preview') {
      return { mascotSrc: `data:image/png;base64,${content.toString('base64')}` };
    }
    return {
      mascotSrc: `cid:${WORKFLOW_MASCOT_CID}`,
      inlineCidAttachments: [{
        cid: WORKFLOW_MASCOT_CID,
        filename: meta.file,
        contentType: 'image/png',
        content,
      }],
    };
  } catch {
    return { mascotSrc: '' };
  }
}

export function mergeInlineCidAttachments(
  ...groups: Array<InlineCidAttachment[] | undefined>
): InlineCidAttachment[] | undefined {
  const merged = groups.flatMap((g) => g ?? []);
  return merged.length ? merged : undefined;
}

/** Small centered mascot illustration block — embedded as base64, works everywhere. */
function mascotBlock(filename: string, alt: string): string {
  const filePath = findMascotFileOnDisk(filename);
  if (!filePath) return '';
  try {
    const data = fs.readFileSync(filePath);
    const src = `data:image/png;base64,${data.toString('base64')}`;
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;margin-bottom:8px;">
      <tr>
        <td align="center" style="padding:20px 0 8px;">
          <img src="${src}" alt="${alt}" width="130" height="130"
               style="display:block;margin:0 auto;width:130px;height:130px;object-fit:contain;border:0;opacity:0.92;" />
        </td>
      </tr>
    </table>`;
  } catch {
    return '';
  }
}

// ── Mascot map per workflow step ──────────────────────────────────────────────
const WORKFLOW_MASCOTS: Record<string, { file: string; alt: string }> = {
  'request-received':          { file: 'mascot-request.png',    alt: 'Rekart mascot with phone' },
  'request-received-reminder': { file: 'mascot-request.png',    alt: 'Rekart mascot with phone' },
  'pickup-scheduled':          { file: 'mascot-pickup.png',     alt: 'Rekart mascot announcing pickup' },
  'pickup-scheduled-reminder': { file: 'mascot-pickup.png',     alt: 'Rekart mascot announcing pickup' },
  'inspection-underway':       { file: 'mascot-inspection.png', alt: 'Rekart mascot on laptop' },
  'offer-ready':               { file: 'mascot-offer.png',      alt: 'Rekart mascot' },
  'offer-ready-reminder':      { file: 'mascot-offer.png',      alt: 'Rekart mascot' },
  'payment-sent':              { file: 'mascot-complete.png',   alt: 'Rekart mascot with recycle symbol' },
  completed:                   { file: 'mascot-complete.png',   alt: 'Rekart mascot celebrating' },
  'device-reship':             { file: 'mascot-reship.png',     alt: 'Rekart mascot' },
  'rent-request':              { file: 'mascot-request.png',    alt: 'Rekart mascot with phone' },
  'rent-agreement':            { file: 'mascot-offer.png',      alt: 'Rekart mascot' },
  'rent-ready-pickup':         { file: 'mascot-pickup.png',     alt: 'Rekart mascot announcing pickup' },
  'rent-dispatched':           { file: 'mascot-reship.png',     alt: 'Rekart mascot' },
  'rent-handover':             { file: 'mascot-complete.png',   alt: 'Rekart mascot celebrating' },
  'rent-return-reminder':      { file: 'mascot-pickup.png',     alt: 'Rekart mascot' },
  'rent-return-received':      { file: 'mascot-inspection.png', alt: 'Rekart mascot on laptop' },
  'rent-closed':               { file: 'mascot-complete.png',   alt: 'Rekart mascot celebrating' },
};

// ── Workflow content builders ─────────────────────────────────────────────────
type WorkflowBuilderFn = (f: FieldData, clickBaseUrl?: string, tokens?: DesignTokens, overrides?: PerEmailOverrides) => string;

const WORKFLOW_CONTENT: Record<string, WorkflowBuilderFn> = {
  'request-received': (f, cb, t, ov) => {
    const st = storageDisplay(f);
    const cond = conditionDisplay(f);
    const est = estimatedValueDisplay(f);
    const estNote =
      'Indicative range only — your final price depends on the item\'s condition after we inspect it. You\'ll get the confirmed amount by email, or our support team will reach out.';

    const mainRows = ([
      ['Request ID', f.requestId],
      ['Item', f.deviceName],
      ['Brand', f.deviceBrand],
      ['Storage', st],
      ['Condition', cond],
      ['Request Date', dv(f.requestDate)],
      ['Currency', f.currency],
      ...(est.trim() !== ''
        ? [['Estimated value', est, { fullWidthNote: estNote }] as InfoTableRow]
        : []),
    ] as InfoTableRow[]).filter((row) => String(row[1] ?? '').trim() !== '');

    const shownInMain = new Set([
      'requestId',
      'customerName',
      'deviceName',
      'deviceBrand',
      'storage',
      'storageCapacity',
      'condition',
      'deviceCondition',
      'requestDate',
      'currency',
      'estimatedPrice',
      'estimatedPriceMin',
      'estimatedPriceMax',
      'trackUrl',
      'acceptUrl',
      'declineUrl',
      'requestAckGeneration',
    ]);

    const extra = infoTableRemainingFields(f, shownInMain);

    const reqAckN = Number(f.requestAckGeneration || 0);
    const revisedCallout =
      reqAckN > 1
        ? alertBox(
            `<strong style="font-size:14px;">Updated request email (#${reqAckN})</strong><br/><span style="font-size:13px;line-height:1.5;">Please use the <strong>Schedule pickup</strong> and <strong>Decline</strong> buttons below &mdash; older links are no longer valid.</span>`,
            'info',
          )
        : '';

    const pickupScheduleHint = `<p style="margin:0 0 14px;font-size:12px;line-height:1.55;color:#475569;">To schedule a free home pickup for inspection, tap <strong style="color:${REKART_BRAND_LIGHT};">Schedule Pickup</strong> below. Our agent will collect and inspect your device &mdash; you will receive a confirmed offer by email.</p>`;

    return [
      revisedCallout,
      deviceCard(f),
      infoTable('Request Details', mainRows),
      extra,
      pickupScheduleHint,
      ctaRow(
        [
          {
            label: ov?.customButtonLabel || 'Schedule Pickup',
            href:  f.acceptUrl || '#',
            style: 'success',
          },
          { label: 'Decline', href: f.declineUrl || '#', style: 'danger' },
        ],
        cb,
        t,
      ),
      alertBox(
        'Our team reviews every request within 24 hours. If you have any questions in the meantime, simply reply to this email.',
        'info',
      ),
    ]
      .filter(Boolean)
      .join('');
  },

  'pickup-scheduled': (f, _cb, t) => {
    const gridItems = [
      { label: 'Pickup Date', value: dv(f.pickupDate) || '' },
      { label: 'Time Window', value: pickupTimeDisplay(f) },
      { label: 'Address', value: f.pickupAddress || '', sub: f.customerName || '' },
      { label: 'Agent', value: f.agentName || '', sub: agentPhoneDisplay(f) },
    ].filter((i) => String(i.value).trim() !== '');
    return [
      deviceCard(f),
      pickupHeroCard(f, t),
      gridItems.length ? infoGrid(gridItems) : '',
      alertBox(
        'Please have your device and original accessories (charging cable, box) ready. A valid government-issued ID will be required at the time of pickup.',
        'success',
      ),
    ].filter(Boolean).join('');
  },

  'inspection-underway': (f) => [
    deviceCard(f),
    infoTable('Inspection Status', [
      ['Request ID', f.requestId],
      ['Inspector', f.inspectorName],
      ['Started At', dv(f.inspectionStartTime || f.inspectionStartDate)],
    ]),
    alertBox('Our certified inspector is carefully evaluating your device across 70+ quality checkpoints. You can expect your personalised offer within 24 hours.', 'warning'),
  ].join(''),

  'offer-ready': (f, cb, t, ov) => {
    const offerAmt = f.finalOffer || f.offerAmount;
    const currency = f.currency || '';
    const revN = Number(f.offerGeneration || 0);
    const revisedCallout =
      revN > 1
        ? alertBox(
            `<strong style="font-size:14px;">Revised offer</strong><br/><span style="font-size:13px;line-height:1.5;">This is an updated amount after your earlier response. The Accept and Decline buttons below apply only to this version &mdash; earlier links are no longer valid.</span>`,
            'info',
          )
        : '';
    const expiryText = f.offerExpiryHours
      ? `This offer is valid for ${f.offerExpiryHours} hours. Accept now to secure your payout.`
      : 'This offer is valid for 48 hours. Accept now to secure your payout.';
    const displayAmt = offerAmt
      ? (currency && !['INR', ''].includes(currency)
          ? formatDisplayMoney(Number(offerAmt), currency)
          : `&#8377;${Number(offerAmt).toLocaleString('en-IN')}`)
      : '&mdash;';
    const mainBlocks = [
      revisedCallout,
      deviceCard(f, displayAmt),
      highlight('Your Offer', displayAmt, expiryText.split('.')[0]),
      infoTable('Offer Details', [
        ['Request ID',  f.requestId],
        ['Item',        f.deviceName],
        ['Valid Until', f.offerValidUntil || (f.offerExpiryHours ? `${f.offerExpiryHours}h from now` : '&mdash;')],
      ]),
      ctaRow([
        { label: ov?.customButtonLabel || 'Accept Offer', href: f.acceptUrl || '#', style: 'success' },
        { label: 'Decline',                               href: f.declineUrl || '#', style: 'danger' },
      ], cb, t),
      alertBox(expiryText, 'warning'),
    ];
    return mainBlocks.filter(Boolean).join('');
  },

  'payment-sent': (f, cb, t) => {
    const paidAmt = f.paidAmount || f.paymentAmount;
    const currency = f.currency || '';
    const displayAmt = paidAmt
      ? (currency && !['INR', ''].includes(currency)
          ? formatDisplayMoney(Number(paidAmt), currency)
          : `&#8377;${Number(paidAmt).toLocaleString('en-IN')}`)
      : '&mdash;';
    const paymentDetailRows: [string, string][] = [
      ['Request ID',              String(f.requestId ?? '').trim()],
      ['Reference / Transaction', String(f.paymentReference || f.transactionId || '').trim()],
      ['Payment Method',          String(f.paymentMethod || f.payoutMethod || '').trim()],
      ['Account / UPI',           String(f.accountDetails ?? '').trim()],
      ['Processed On', dv(String(f.paymentDate ?? '').trim())],
      ...(f.bankNote && String(f.bankNote).trim()
        ? [['Note', String(f.bankNote).trim()] as [string, string]]
        : []),
    ].filter(
      (row): row is [string, string] => String(row[1] ?? '').trim() !== '',
    );

    return [
      highlight('Amount Paid', displayAmt, 'Successfully transferred to your account'),
      infoTable('Payment Details', paymentDetailRows),
      alertBox('Payment has been processed and is on its way. It may take 1&ndash;3 business days to reflect, depending on your bank.', 'success'),
    ].join('');
  },

  completed: (f) => [
    highlight('Transaction Complete', '&#127881;', 'Thank you for choosing Rekart'),
    infoTable('Summary', [
      ['Request ID',   f.requestId],
      ['Item',         f.deviceName],
      ['Final Amount', f.finalAmount ? `&#8377;${Number(f.finalAmount).toLocaleString('en-IN')}` : ''],
      ['Completed On', dv(f.completionDate)],
    ]),
    alertBox('Your sell journey is complete. Thank you for choosing Rekart &mdash; we hope to serve you again soon!', 'success'),
  ].join(''),

  'device-reship': (f, _cb, t) => {
    const courier = String(
      f.reshipCourier || f.courierName || '',
    ).trim();
    const tracking = String(
      f.reshipTracking || f.trackingNumber || '',
    ).trim();
    const trackUrlRaw = String(
      f.reshipTrackingUrl || f.trackingUrl || '',
    ).trim();
    const trackHref =
      /^https?:\/\//i.test(trackUrlRaw) ? trackUrlRaw : '';
    const noteRaw = String(f.reshipMessage ?? '').trim();
    const noteBlock = noteRaw
      ? alertBox(
          `<strong style="display:block;margin-bottom:8px;font-size:13px;color:#0f172a;">A note from our team</strong><span style="font-size:14px;line-height:1.55;color:#334155;">${escapeHtmlEntities(noteRaw).replace(/\n/g, '<br/>')}</span>`,
          'info',
        )
      : '';
    const trackCta = trackHref
      ? ctaRow([{ label: 'Track Shipment', href: trackHref, style: 'primary' }], undefined, t)
      : '';
    const shipRows: [string, string][] = [
      ['Request ID', String(f.requestId ?? '').trim()],
      ['Item', String(f.deviceName ?? '').trim()],
      ['Courier', courier],
      ['Tracking number', tracking],
    ].filter((row): row is [string, string] => String(row[1] ?? '').trim() !== '');
    const footerMsg = trackHref
      ? 'Thank you for trusting us. Use the Track Shipment button above to follow your return in real time. We hope to serve you again soon — your satisfaction means everything to us.'
      : 'Thank you for trusting us. Please use the tracking details above to follow your return. We hope to have the pleasure of serving you again — your business is valued and appreciated.';
    return [
      highlight('Your item is on its way back', '&#128230;', 'We\'ve dispatched a return shipment for you'),
      noteBlock,
      trackCta,
      infoTable('Return shipment', shipRows),
      alertBox(footerMsg, 'success'),
    ]
      .filter(Boolean)
      .join('');
  },
};

// ?? Reminder workflow entries (reuse base builders + prepend banner) ??????????
(WORKFLOW_CONTENT as Record<string, WorkflowBuilderFn>)['request-received-reminder'] =
  (f, cb, t, ov) =>
    reminderBanner(REMINDER_MESSAGES['request-received-reminder'], f) +
    (WORKFLOW_CONTENT['request-received']!(f, cb, t, ov));

(WORKFLOW_CONTENT as Record<string, WorkflowBuilderFn>)['offer-ready-reminder'] =
  (f, cb, t, ov) =>
    reminderBanner(REMINDER_MESSAGES['offer-ready-reminder'], f) +
    (WORKFLOW_CONTENT['offer-ready']!(f, cb, t, ov));

(WORKFLOW_CONTENT as Record<string, WorkflowBuilderFn>)['pickup-scheduled-reminder'] =
  (f, cb, t, ov) =>
    reminderBanner(REMINDER_MESSAGES['pickup-scheduled-reminder'], f) +
    (WORKFLOW_CONTENT['pickup-scheduled']!(f, cb, t, ov));

// ?? Reminder banner ???????????????????????????????????????????????????????????

/**
 * Amber "friendly reminder" banner injected at the top of reminder emails.
 */
function reminderBanner(message: string, _f?: FieldData): string {
  const safe = escapeHtmlEntities(message);
  return `
    <div class="reminder-banner">
      <div class="reminder-banner-inner">
        <p class="reminder-banner-title">&#9201; Friendly Reminder</p>
        <p class="reminder-banner-text">${safe}</p>
      </div>
    </div>`;
}

const REMINDER_MESSAGES: Record<string, string> = {
  'request-received-reminder':
    "We noticed you haven't confirmed or declined your sell request yet. Please use the buttons below to let us know how you'd like to proceed &mdash; it only takes a second.",
  'offer-ready-reminder':
    "Your offer is still waiting! We've made you an offer for your device and would love to hear back. Please review and accept or decline using the buttons below.",
  'pickup-scheduled-reminder':
    "Just a reminder about your upcoming pickup! Please make sure you're available at the address below with your item and ID ready.",
};

// ?? Step display names ????????????????????????????????????????????????????????
const STEP_NAMES: Record<string, string> = {
  'request-received':          'Request Received',
  'request-received-reminder': 'Request Received',
  'pickup-scheduled':          'Pickup Scheduled',
  'pickup-scheduled-reminder': 'Pickup Scheduled',
  'inspection-underway':       'Inspection Underway',
  'offer-ready':               'Offer Ready',
  'offer-ready-reminder':      'Offer Ready',
  'payment-sent':              'Payment Sent',
  completed:                   'Completed',
  'device-reship':             'Return shipment',
};

const GREETINGS: Record<string, (f: FieldData) => string> = {
  'request-received':          (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'request-received-reminder': (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'pickup-scheduled':          (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'pickup-scheduled-reminder': (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'inspection-underway':       (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'offer-ready':               (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'offer-ready-reminder':      (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'payment-sent':              (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  completed:                   (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'device-reship':             (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
};

const BODY_TEXT: Record<string, (f: FieldData) => string> = {
  'request-received': (f) =>
    `Thank you for reaching out to Rekart. We've received your sell request for your ${f.deviceName || 'device'} and our team is reviewing it. Please confirm using the button below to move to the next step.`,

  'pickup-scheduled': (f) => {
    const slot = pickupTimeDisplay(f);
    const day  = dv(f.pickupDate) || 'the scheduled date';
    return `Great news - your pickup is confirmed for ${day}${slot ? ` between ${slot}` : ''}. Please have your device and a valid ID ready. Our agent will contact you before arriving.`;
  },

  'inspection-underway': (f) =>
    `Your ${f.deviceName || 'device'} is now with our certified inspection team. We'll evaluate it carefully and share your personalised offer as soon as we're done - usually within 24 hours.`,

  'offer-ready': (f) =>
    `We've completed the inspection of your ${f.deviceName || 'device'} and are pleased to present you with an offer. Review the amount below and let us know your decision.`,

  'request-received-reminder': (f) =>
    `Just a gentle nudge - your sell request for your ${f.deviceName || 'device'} is waiting for your confirmation. Please use the button below at your earliest convenience.`,

  'pickup-scheduled-reminder': (f) => {
    const slot = pickupTimeDisplay(f);
    const day  = dv(f.pickupDate) || 'the scheduled date';
    return `This is a reminder about your upcoming pickup on ${day}${slot ? ` (${slot})` : ''}. Please ensure your device and a valid ID are ready when our agent arrives.`;
  },

  'offer-ready-reminder': (f) =>
    `Your offer for the ${f.deviceName || 'device'} is still open and waiting for your response. Accept to secure your payout, or decline if you've changed your mind - either way, just let us know.`,

  'payment-sent': (f) =>
    `We're happy to confirm that your payment of ${f.paidAmount || f.paymentAmount ? '' : 'the agreed amount '}has been dispatched to your ${f.payoutMethod || f.paymentMethod || 'account'}. It should arrive within 1-3 business days.`,

  completed: (f) =>
    `Your sell transaction for your ${f.deviceName || 'device'} is now fully complete. It's been a pleasure doing business with you. We look forward to welcoming you back to Rekart.`,

  'device-reship': (f) =>
    `We're returning your ${f.deviceName || 'device'} to you. We're sorry the transaction didn't go ahead this time. We truly appreciate you choosing Rekart and hope to serve you again in the future.`,
};

// ?? Main render function ??????????????????????????????????????????????????????
export function renderSellEmailHtml(
  workflowKey: string,
  dynamicValues: Record<string, unknown>,
  opts: {
    workspaceName?: string;
    logoUrl?: string;
    mascotSrc?: string;
    socialIconSrcs?: Record<string, string>;
    subject?: string;
    /** @deprecated use designTokens instead */
    brandTheme?: Partial<BrandTheme>;
    designTokens?: Partial<DesignTokens>;
    footer?: FooterOptions;
    perEmailOverrides?: PerEmailOverrides;
    tracking?: TrackingOptions;
    compliance?: ComplianceOptions;
  } = {},
): string {
  const f: FieldData = Object.fromEntries(
    Object.entries(dynamicValues)
      .filter(([k]) => k !== 'customMessages')
      .map(([k, v]) => [k, String(v ?? '')]),
  );

  // Merge design tokens: defaults ? workspace tokens ? legacy brandTheme mapping
  const legacyBrandOverride: Partial<DesignTokens> = opts.brandTheme
    ? {
        primaryColor:   opts.brandTheme.primary   ?? undefined,
        secondaryColor: opts.brandTheme.secondary ?? undefined,
        accentColor:    opts.brandTheme.accent    ?? undefined,
        brandMode:      opts.brandTheme.mode      ?? undefined,
      }
    : {};

  const tokens: DesignTokens = {
    ...DEFAULT_DESIGN_TOKENS,
    ...legacyBrandOverride,
    ...(opts.designTokens ?? {}),
  };

  // Per-email color overrides
  const ov: PerEmailOverrides = { ...(opts.footer ?? {}), ...(opts.perEmailOverrides ?? {}) };

  const complianceColors = resolveComplianceStripColors(
    tokens,
    opts.compliance?.complianceBgColor,
    opts.compliance?.complianceTextColor,
  );

  const emailCss = injectComplianceStripStyles(
    buildEmailCss(tokens, {
      headingColor:  ov.customHeadingColor   || undefined,
      bodyTextColor: ov.customBodyTextColor  || undefined,
    }),
    complianceColors,
  );

  const fontImport = buildFontImport(tokens.headingFontFamily, tokens.bodyFontFamily);

  const stepName  = STEP_NAMES[workflowKey] ?? workflowKey;
  const contentFn = WORKFLOW_CONTENT[workflowKey] ?? WORKFLOW_CONTENT['completed'];
  const greetingFn = GREETINGS[workflowKey] ?? ((ff: FieldData) => `Hi ${ff.customerName || 'there'},`);
  const bodyFn     = BODY_TEXT[workflowKey] ?? (() => 'Please review the details below.');

  // Footer values
  const fo = opts.footer ?? {};
  const workspaceName    = opts.workspaceName ?? 'Rekart';
  const signoffName      = ov.customSignoffName || fo.teamDisplayName || `${workspaceName} Team`;
  const footerGreeting   = tokens.footerGreetingText || 'Warm regards,';
  const footerNote       = ov.customFooterNote || fo.customFooterNote || tokens.footerNote || '';
  const copyrightLine    = tokens.copyrightText || `\u00a9 ${new Date().getFullYear()} ${workspaceName}`;
  const privacyPolicyUrl  = fo.privacyPolicyUrl  || '';
  const termsOfServiceUrl = fo.termsOfServiceUrl || '';
  const supportUrl        = fo.supportUrl        || '';
  const hasFooterLinks    = !!(privacyPolicyUrl || termsOfServiceUrl || supportUrl);
  const showPrivacyDot    = !!(privacyPolicyUrl  && (termsOfServiceUrl || supportUrl));
  const showTermsDot      = !!(termsOfServiceUrl && supportUrl);

  const complianceBlock = buildComplianceBlock(opts.compliance, privacyPolicyUrl);

  const greeting = ov.customGreetingText || greetingFn(f);
  void greeting; // greeting merged into hero via bodyText/headline

  // Social links HTML snippet
  const socialIconSrcs = opts.socialIconSrcs ?? Object.fromEntries(
    SOCIAL_LINK_ORDER
      .map((key) => [key, getSocialIconDataUriSync(key)] as const)
      .filter(([, src]) => src),
  );
  const socialLinksHtml = buildSocialLinksHtml(
    resolveSocialLinks(fo.socialLinks),
    socialIconSrcs,
    opts.tracking?.clickBaseUrl,
  );

  const mainBlocks  = contentFn(f, opts.tracking?.clickBaseUrl, tokens, ov);
  const customBlock = customMessageCallout(f);
  const contentBlocks = `${customBlock}${mainBlocks}`;

  const heroHeadline    = HERO_HEADLINES[workflowKey] ?? stepName;
  const stepProgressBlock = stepProgressHtml(workflowKey, REKART_TOP_BAR);
  const mascotMeta        = workflowMascotMeta(workflowKey);
  const heroMascotBlock   = heroMascotHtml(opts.mascotSrc ?? '', mascotMeta?.alt ?? 'Rekart mascot');

  const companyAddressHtml = footerAddressHtml(
    resolveFooterAddress(fo.companyAddress),
  );

  const rawHtml = BASE_SHELL({
    subject: opts.subject ?? stepName,
    stepBadge: stepName.toUpperCase(),
    heroHeadline,
    bodyText:   bodyFn(f),
    contentBlocks,
    stepProgressHtml: stepProgressBlock,
    heroMascotHtml: heroMascotBlock,
    workspaceName,
    logoUrl: opts.logoUrl ?? '',
    year: new Date().getFullYear(),
    complianceBlock,
    emailCss,
    fontImport,
    footerGreeting,
    signoffName,
    footerNote,
    companyAddress: companyAddressHtml,
    supportPhone:   fo.supportPhone   || '',
    website:        fo.website        || '',
    privacyPolicyUrl,
    termsOfServiceUrl,
    supportUrl,
    hasFooterLinks,
    showPrivacyDot,
    showTermsDot,
    socialLinksHtml,
    copyrightLine,
  });

  // Cache lookup ? exclude tracking from the key so unique pixel URLs don't
  // bust the cache on every send. The pixel is injected after cache retrieval.
  const { tracking, ...optsForKey } = opts;
  const key = cacheKey(workflowKey, dynamicValues, optsForKey as Record<string, unknown>);
  let inlined = cacheGet(key);

  if (!inlined) {
    inlined = juice(rawHtml, {
      removeStyleTags: false,
      applyStyleTags: true,
      applyAttributesTableElements: true,
      preserveMediaQueries: true,
      preserveFontFaces: true,
    });
    cacheSet(key, inlined);
  }

  if (tracking?.trackingPixelUrl) {
    const pixel = `<img src="${tracking.trackingPixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;" />`;
    return inlined.replace('</body>', `${pixel}\n</body>`);
  }

  return inlined;
}

// ?? Compliance block builder ??????????????????????????????????????????????????
function buildComplianceBlock(compliance?: ComplianceOptions, privacyPolicyUrl?: string): string {
  const wsName = compliance?.workspaceName ?? 'Rekart';
  const year   = new Date().getFullYear();
  const privacyHref = privacyPolicyUrl?.trim() || '#';
  const privacyLink = `<a href="${privacyHref}" class="compliance-link">Privacy Policy</a>`;

  // Use custom compliance text if provided
  if (compliance?.customComplianceText) {
    const text = compliance.customComplianceText
      .replace(/\{\{year\}\}/g, String(year))
      .replace(/\{\{workspaceName\}\}/g, wsName);
    if (compliance.unsubscribeUrl) {
      return `${text}<br /><a href="${compliance.unsubscribeUrl}" class="compliance-link">Unsubscribe</a>`;
    }
    return text;
  }

  if (!compliance?.unsubscribeUrl) {
    return `This is a transactional email sent by <strong>${wsName}</strong>.`;
  }
  return `You are receiving this email as a customer of <strong>${wsName}</strong>.<br />
    <a href="${compliance.unsubscribeUrl}" class="compliance-link">Unsubscribe</a>
    &nbsp;&middot;&nbsp;
    ${privacyLink}
    &nbsp;&middot;&nbsp; &copy; ${year} ${wsName}`;
}

// ?? Helper: build DesignTokens from raw branding document ?????????????????????
export function brandingToDesignTokens(
  b: Record<string, unknown> | null | undefined,
): DesignTokens {
  if (!b) return { ...DEFAULT_DESIGN_TOKENS };
  const str = (key: string, fallback: string) =>
    (b[key] as string) || fallback;
  return {
    primaryColor:         str('primaryColor',         DEFAULT_DESIGN_TOKENS.primaryColor),
    secondaryColor:       str('secondaryColor',       DEFAULT_DESIGN_TOKENS.secondaryColor),
    accentColor:          str('accentColor',          DEFAULT_DESIGN_TOKENS.accentColor),
    brandMode:            (b['brandMode'] as DesignTokens['brandMode']) || DEFAULT_DESIGN_TOKENS.brandMode,
    buttonTextColor:      str('buttonTextColor',      DEFAULT_DESIGN_TOKENS.buttonTextColor),
    headerTextColor:      str('headerTextColor',      DEFAULT_DESIGN_TOKENS.headerTextColor),
    bodyTextColor:        str('bodyTextColor',        DEFAULT_DESIGN_TOKENS.bodyTextColor),
    mutedTextColor:       str('mutedTextColor',       DEFAULT_DESIGN_TOKENS.mutedTextColor),
    footerTextColor:      str('footerTextColor',      DEFAULT_DESIGN_TOKENS.footerTextColor),
    borderColor:          str('borderColor',          DEFAULT_DESIGN_TOKENS.borderColor),
    emailBackgroundColor: str('emailBackgroundColor', DEFAULT_DESIGN_TOKENS.emailBackgroundColor),
    cardBackgroundColor:  str('cardBackgroundColor',  DEFAULT_DESIGN_TOKENS.cardBackgroundColor),
    headingFontFamily:    str('headingFontFamily',    DEFAULT_DESIGN_TOKENS.headingFontFamily),
    bodyFontFamily:       str('bodyFontFamily',       DEFAULT_DESIGN_TOKENS.bodyFontFamily),
    headingFontSize:      str('headingFontSize',      DEFAULT_DESIGN_TOKENS.headingFontSize),
    bodyFontSize:         str('bodyFontSize',         DEFAULT_DESIGN_TOKENS.bodyFontSize),
    buttonFontSize:       str('buttonFontSize',       DEFAULT_DESIGN_TOKENS.buttonFontSize),
    lineHeight:           str('lineHeight',           DEFAULT_DESIGN_TOKENS.lineHeight),
    headingFontWeight:    str('headingFontWeight',    DEFAULT_DESIGN_TOKENS.headingFontWeight),
    bodyFontWeight:       str('bodyFontWeight',       DEFAULT_DESIGN_TOKENS.bodyFontWeight),
    buttonRadius:         str('buttonRadius',         DEFAULT_DESIGN_TOKENS.buttonRadius),
    buttonPadding:        str('buttonPadding',        DEFAULT_DESIGN_TOKENS.buttonPadding),
    buttonStyle:          str('buttonStyle',          DEFAULT_DESIGN_TOKENS.buttonStyle),
    emailWidth:           str('emailWidth',           DEFAULT_DESIGN_TOKENS.emailWidth),
    contentPadding:       str('contentPadding',       DEFAULT_DESIGN_TOKENS.contentPadding),
    sectionSpacing:       str('sectionSpacing',       DEFAULT_DESIGN_TOKENS.sectionSpacing),
    cardRadius:           str('cardRadius',           DEFAULT_DESIGN_TOKENS.cardRadius),
    footerGreetingText:   str('footerGreetingText',   DEFAULT_DESIGN_TOKENS.footerGreetingText),
    footerNote:           str('footerNote',           DEFAULT_DESIGN_TOKENS.footerNote),
    copyrightText:        str('copyrightText',        DEFAULT_DESIGN_TOKENS.copyrightText),
  };
}

// ?? divider export for workflow use ??????????????????????????????????????????
export { divider };
