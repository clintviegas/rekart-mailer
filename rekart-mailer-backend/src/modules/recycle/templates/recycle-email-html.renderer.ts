import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import type { InlineCidAttachment } from '../../../providers/email/email-provider.interface';
import { displayDateValue as dv, normalizePickUpAddress } from '../../../common/date-format';
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
  unsubscribeUrl?: string;
  workspaceName?: string;
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
.progress-dot.skipped { background:#f1f5f9;color:#94a3b8;font-size:13px;line-height:26px; }
.progress-step.skipped { text-decoration:line-through;color:#cbd5e1;opacity:0.85; }
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
  'recycle-request':          'Confirm your e-waste pickup',
  'recycle-request-reminder': 'Still waiting for your confirmation',
  'pickup-scheduled':          'Your pickup is scheduled!',
  'pickup-scheduled-reminder': 'Reminder: pickup coming up',
  'devices-collected':       'Devices collected safely',
  'certificate-issued':      'Your recycling certificate is ready',
};

const Recycle_PROGRESS_STEPS = [
  { key: 'recycle-request', label: 'Request' },
  { key: 'pickup-scheduled', label: 'Pickup' },
  { key: 'devices-collected', label: 'Collected' },
  { key: 'certificate-issued', label: 'Certificate' },
];

function progressStepsForEmail(_workflowKey: string): { key: string; label: string }[] {
  return Recycle_PROGRESS_STEPS;
}

function progressStepIndex(workflowKey: string, steps: { key: string; label: string }[]): number {
  const base = workflowKey.replace(/-reminder$/, '');
  if (base === 'recycle-request-reminder') {
    return Math.max(0, steps.findIndex((s) => s.key === 'recycle-request'));
  }
  if (base === 'pickup-scheduled-reminder') {
    return Math.max(0, steps.findIndex((s) => s.key === 'pickup-scheduled'));
  }
  const idx = steps.findIndex((s) => s.key === base);
  return idx >= 0 ? idx : 0;
}

type ProgressStepVisualState = 'pending' | 'completed' | 'current' | 'skipped';

/** unrecycled return: Booked→Quote done, Recycle/Ready/Dispatch skipped, Returned active. */
function unrecycledReturnProgressStates(
  workflowKey: string,
  steps: { key: string; label: string }[],
): ProgressStepVisualState[] | null {
  const base = workflowKey.replace(/-reminder$/, '');
  if (base !== 'device-return-unrecycled' && base !== 'device-return-unrecycled-complete') {
    return null;
  }
  const quoteIdx = steps.findIndex((s) => s.key === 'quote-ready');
  const returnedIdx = steps.findIndex((s) => s.key === 'certificate-issued');
  return steps.map((step, i) => {
    if (i <= quoteIdx) return 'completed';
    if (i < returnedIdx) return 'skipped';
    return 'current';
  });
}

function RecycleProgressVisualStates(
  workflowKey: string,
  steps: { key: string; label: string }[],
  _f?: FieldData,
): ProgressStepVisualState[] {
  const activeIdx = progressStepIndex(workflowKey, steps);
  return steps.map((_, i) => {
    if (i === activeIdx) return 'current';
    if (i < activeIdx) return 'completed';
    return 'pending';
  });
}

function progressCellHtml(
  step: { label: string },
  index: number,
  state: ProgressStepVisualState,
  primary: string,
  stepCount: number,
): string {
  const width = Math.floor(100 / stepCount);
  let dotContent = String(index + 1);
  let dotClass = 'progress-dot';
  let dotStyle = '';
  let stepClass = 'progress-step';

  switch (state) {
    case 'current':
      dotClass += ' active';
      stepClass += ' active';
      break;
    case 'completed':
      dotStyle = `background:${lighten(primary, 0.75)};color:${primary};`;
      break;
    case 'skipped':
      dotContent = '&#10005;';
      dotClass += ' skipped';
      stepClass += ' skipped';
      break;
    case 'pending':
    default:
      break;
  }

  return `
      <td align="center" style="width:${width}%;vertical-align:top;padding:0 2px;">
        <div class="${dotClass}" style="${dotStyle}">${dotContent}</div>
        <div class="${stepClass}">${step.label}</div>
      </td>`;
}

function stepProgressHtml(workflowKey: string, primary: string, f?: FieldData): string {
  const steps = progressStepsForEmail(workflowKey);
  const states = RecycleProgressVisualStates(workflowKey, steps, f);
  const cells = steps
    .map((step, i) => progressCellHtml(step, i, states[i], primary, steps.length))
    .join('');
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
                <span class="top-bar-label">{{journeyLabel}}</span>
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

const INFO_TABLE_VALUE_INLINE_STYLE =
  `color:${REKART_NAVY};font-weight:600;font-size:14px;line-height:1.4;text-align:right;letter-spacing:0;` +
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;";

const QUOTE_DISCOUNT_COLOR = '#059669';

const INFO_TABLE_DISCOUNT_VALUE_INLINE_STYLE =
  `color:${QUOTE_DISCOUNT_COLOR};font-weight:600;font-size:14px;line-height:1.4;text-align:right;letter-spacing:0;` +
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;";

/** Right-column value — inline styles for Gmail/Outlook. Multi-line cells wrap normally. */
function infoTableValueHtml(
  value: string,
  compactBottom = false,
  styleOverride = INFO_TABLE_VALUE_INLINE_STYLE,
): string {
  const v = String(value ?? '').trim();
  const content = v || '&mdash;';
  const hasMarkup = /<[^>]+>|&#\w+;|&mdash;/.test(content);
  const safe = hasMarkup ? content : escapeHtmlEntities(content);
  const compactStyle = compactBottom ? 'padding-bottom:4px;border-bottom:0;' : '';
  if (hasMarkup) {
    return (
      `<td class="value value-rich" align="right" valign="top" style="${styleOverride}${compactStyle}` +
      `white-space:normal;word-wrap:break-word;overflow:visible;line-height:1.45;">${safe}</td>`
    );
  }
  return (
    `<td class="value" align="right" valign="middle" style="${styleOverride}${compactStyle}white-space:nowrap;">${safe}</td>`
  );
}

type InfoTableFootnote = { fullWidthNote: string };
type InfoTableRow = [string, string] | [string, string, InfoTableFootnote];

type QuoteLineItemParsed = { label: string; amount: number };

function parseQuoteLineItems(f: FieldData): QuoteLineItemParsed[] {
  const raw = f.quoteLineItems;
  if (!raw?.trim()) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const label = String(r.description ?? r.label ?? r.name ?? '').trim();
        const amount = Number(r.amount ?? r.charge ?? 0);
        if (!label || !Number.isFinite(amount) || amount <= 0) return null;
        return { label, amount };
      })
      .filter((x): x is QuoteLineItemParsed => x != null);
  } catch {
    return [];
  }
}

function parseQuoteDiscounts(f: FieldData): QuoteLineItemParsed[] {
  const raw = f.quoteDiscounts;
  if (!raw?.trim()) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const label = String(r.description ?? r.label ?? r.name ?? '').trim();
        const amount = Number(r.amount ?? r.discount ?? 0);
        if (!label || !Number.isFinite(amount) || amount <= 0) return null;
        return { label, amount };
      })
      .filter((x): x is QuoteLineItemParsed => x != null);
  } catch {
    return [];
  }
}

function formatQuoteMoney(amount: number, currency: string): string {
  const cur = currency?.trim();
  if (cur && !['INR', ''].includes(cur)) {
    return formatDisplayMoney(amount, cur);
  }
  return `&#8377;${amount.toLocaleString('en-IN')}`;
}

function formatQuoteMoneyNegative(amount: number, currency: string): string {
  return `− ${formatQuoteMoney(amount, currency)}`;
}

function quoteBreakdownTable(
  items: QuoteLineItemParsed[],
  discounts: QuoteLineItemParsed[],
  currency: string,
  total: number,
): string {
  if (!items.length) return '';
  const rows = items
    .map(
      ({ label, amount }) => `<tr>
        <td class="label">${escapeHtmlEntities(label)}</td>
        ${infoTableValueHtml(formatQuoteMoney(amount, currency))}
      </tr>`,
    )
    .join('');
  const subtotal = items.reduce((sum, row) => sum + row.amount, 0);
  const discountTotal = discounts.reduce((sum, row) => sum + row.amount, 0);
  const discountRows =
    discountTotal > 0
      ? `<tr>
        <td class="label" style="font-weight:600;border-top:1px solid #e2e8f0;">Subtotal</td>
        ${infoTableValueHtml(formatQuoteMoney(subtotal, currency))}
      </tr>${discounts
        .map(
          ({ label, amount }) => `<tr>
        <td class="label" style="color:${QUOTE_DISCOUNT_COLOR};">${escapeHtmlEntities(label)}</td>
        ${infoTableValueHtml(formatQuoteMoneyNegative(amount, currency), false, INFO_TABLE_DISCOUNT_VALUE_INLINE_STYLE)}
      </tr>`,
        )
        .join('')}`
      : '';
  const totalRow = `<tr>
        <td class="label" style="font-weight:700;border-top:2px solid #e2e8f0;">Total</td>
        ${infoTableValueHtml(formatQuoteMoney(total, currency))}
      </tr>`;
  return `
    <div class="info-card">
      <div class="info-card-title">Quote breakdown</div>
      <table class="info-table" role="presentation" width="100%"><tbody>${rows}${discountRows}${totalRow}</tbody></table>
    </div>`;
}

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
  const valueBlock = String(value ?? '').trim()
    ? `<p class="highlight-value">${value}</p>`
    : '';
  return `
    <div class="highlight-box">
      <p class="highlight-label">${label}</p>
      ${valueBlock}
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
      <div class="pickup-card-header">&#9851; Pickup scheduled</div>
      <div class="pickup-card-body">
        <p class="pickup-when">${escapeHtmlEntities(when)}</p>
        <p class="pickup-where">${escapeHtmlEntities(where)}</p>
        ${agentLine ? `<p class="pickup-agent">Collection agent: ${escapeHtmlEntities(agentLine)}</p>` : ''}
        <p class="pickup-card-note">
          Please keep items accessible at the pickup location. Our agent will contact you before arriving.
        </p>
      </div>
    </div>`;
}

function collectionModeLabel(mode: string): string {
  const m = mode.trim().toLowerCase();
  if (m === 'bulk_estimate') return 'Bulk / office clearance (estimate)';
  if (m === 'listed') return 'Known item list';
  return mode.trim();
}

function bulkEstimateLabel(band: string): string {
  const map: Record<string, string> = {
    '1-5': '1–5 devices',
    '6-20': '6–20 devices',
    '21-50': '21–50 devices',
    '50+': '50+ devices',
    unknown: 'Unknown — assess onsite',
  };
  return map[band.trim()] ?? band.trim();
}

/** Recycle request card — items summary instead of single device specs. */
function recycleCollectionCard(f: FieldData): string {
  const summary = String(f.recycleItemsSummary ?? f.deviceName ?? '').trim() || 'Your items for recycling';
  const mode = collectionModeLabel(String(f.collectionMode ?? ''));
  const reqId = f.requestId?.trim() || '';
  const date = dv(f.requestDate)?.trim() || '';
  const headerLeft = reqId ? `Request #${escapeHtmlEntities(reqId)}` : 'Recycle request';
  const headerRight = date ? escapeHtmlEntities(date) : '';
  const meta = [mode].filter(Boolean).map((p) => escapeHtmlEntities(p)).join(' · ');

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
            <p class="detail-device-name">${escapeHtmlEntities(summary)}</p>
            ${meta ? `<p class="detail-device-meta">${meta}</p>` : ''}
          </td>
        </tr>
      </table>
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
  'recycle-request':          { file: 'mascot-request.png',    alt: 'Rekart mascot' },
  'recycle-request-reminder': { file: 'mascot-request.png',    alt: 'Rekart mascot' },
  'pickup-scheduled':          { file: 'mascot-pickup.png',     alt: 'Rekart mascot' },
  'pickup-scheduled-reminder': { file: 'mascot-pickup.png',     alt: 'Rekart mascot' },
  'devices-collected':       { file: 'mascot-inspection.png', alt: 'Rekart mascot' },
  'certificate-issued':             { file: 'mascot-complete.png',   alt: 'Rekart mascot' },
};

// ── Workflow content builders ─────────────────────────────────────────────────
type WorkflowBuilderFn = (f: FieldData, clickBaseUrl?: string, tokens?: DesignTokens, overrides?: PerEmailOverrides) => string;

const WORKFLOW_CONTENT: Record<string, WorkflowBuilderFn> = {
  'recycle-request': (f, cb, t, ov) => {
    const mode = collectionModeLabel(String(f.collectionMode ?? ''));
    const bulkBand = String(f.bulkEstimate ?? '').trim();
    const notes = String(f.collectionNotes ?? '').trim();
    const pickupAddr = normalizePickUpAddress(String(f.pickupAddress ?? ''));

    const mainRows = ([
      ['Request ID', f.requestId],
      ...(mode ? [['Collection type', mode] as InfoTableRow] : []),
      ...(bulkBand ? [['Est. volume', bulkEstimateLabel(bulkBand)] as InfoTableRow] : []),
      ['Items / description', f.recycleItemsSummary || f.deviceName],
      ...(pickupAddr ? [['Pickup address', pickupAddr] as InfoTableRow] : []),
      ...(notes ? [['Notes', notes] as InfoTableRow] : []),
    ] as InfoTableRow[]).filter((row) => String(row[1] ?? '').trim() !== '');

    const reqAckN = Number(f.requestAckGeneration || 0);
    const revisedCallout =
      reqAckN > 1
        ? alertBox(
            `<strong style="font-size:14px;">Updated request email (#${reqAckN})</strong><br/><span style="font-size:13px;line-height:1.5;">Please use the <strong>Confirm Pickup</strong> and <strong>Decline</strong> buttons below &mdash; older links are no longer valid.</span>`,
            'info',
          )
        : '';

    const confirmHint = `<p style="margin:0 0 14px;font-size:12px;line-height:1.55;color:#475569;">Tap <strong style="color:${REKART_BRAND_LIGHT};">Confirm Pickup</strong> to choose your preferred date, time window, and pickup address. For bulk or office clearances, final counts are confirmed when our team collects on site.</p>`;

    return [
      revisedCallout,
      recycleCollectionCard(f),
      infoTable('Collection request', mainRows),
      confirmHint,
      ctaRow(
        [
          {
            label: ov?.customButtonLabel || 'Confirm Pickup',
            href:  f.acceptUrl || '#',
            style: 'success',
          },
          { label: 'Decline', href: f.declineUrl || '#', style: 'danger' },
        ],
        cb,
        t,
      ),
      alertBox(
        'We review every recycling request within 24 hours. Reply to this email if anything in the list or address needs updating.',
        'info',
      ),
    ]
      .filter(Boolean)
      .join('');
  },

  'pickup-scheduled': (f, _cb, t) => {
    const summary = String(f.recycleItemsSummary ?? f.deviceName ?? '').trim();
    const gridItems = [
      { label: 'Pickup date', value: dv(f.pickupDate) || '' },
      { label: 'Time window', value: pickupTimeDisplay(f) },
      { label: 'Pickup address', value: f.pickupAddress || '', sub: f.customerName || '' },
      { label: 'Collection agent', value: f.agentName || '', sub: agentPhoneDisplay(f) },
      ...(summary ? [{ label: 'Items', value: summary }] : []),
    ].filter((i) => String(i.value).trim() !== '');
    return [
      recycleCollectionCard(f),
      pickupHeroCard(f, t),
      gridItems.length ? infoGrid(gridItems) : '',
      alertBox(
        'Please keep the listed items (or the agreed bulk estimate) ready and accessible at the pickup address. Data-bearing devices should be backed up before handover.',
        'success',
      ),
    ].filter(Boolean).join('');
  },

  'devices-collected': (f) => {
    const actualSummary = String(f.actualItemsSummary ?? f.recycleItemsSummary ?? '').trim();
    const actualQty = String(f.actualTotalQty ?? '').trim();
    const rows = ([
      ['Request ID', f.requestId],
      ['Collected on', dv(f.collectedDate)],
      ['Collected by', f.collectedBy],
      ...(actualSummary ? [['Items collected', actualSummary] as InfoTableRow] : []),
      ...(actualQty ? [['Total quantity', actualQty] as InfoTableRow] : []),
    ] as InfoTableRow[]).filter((row) => String(row[1] ?? '').trim() !== '');

    return [
      recycleCollectionCard(f),
      highlight('Collection complete', actualQty || '&#9989;', actualSummary || 'Your items are now with Rekart'),
      infoTable('Collection record', rows),
      alertBox(
        'Your e-waste has been collected and is being processed for responsible recycling. We will email your certificate once processing is complete.',
        'info',
      ),
    ].join('');
  },

  'diagnosing': (f) => [
    deviceCard(f),
    infoTable('Diagnosis Status', [
      ['Request ID', f.requestId],
      ['Technician', f.technicianName || f.inspectorName],
      ['Service Centre', normalizePickUpAddress(String(f.diagnosisCenter || f.inspectionCenter || ''))],
      ['Est. Complete', dv(f.estimatedDiagnosisDate || f.estimatedCompletion)],
    ]),
    alertBox('Our technicians are diagnosing your item. We will email you a Recycle quote as soon as the assessment is complete.', 'warning'),
  ].join(''),

  'device-ready': (f, cb, t) => {
    const storeAddress = normalizePickUpAddress(String(f.collectionAddress ?? ''));
    const collectionHours = String(f.collectionHours ?? '').trim();
    const collectUrl = String(f.collectFromStoreUrl ?? '').trim();
    const courierUrl = String(f.courierDeliveryUrl ?? '').trim();
    const ctaButtons = [
      collectUrl
        ? { label: 'Collect from our store', href: collectUrl, style: 'success' as const }
        : null,
      courierUrl
        ? { label: 'Courier delivery', href: courierUrl, style: 'primary' as const }
        : null,
    ].filter(Boolean) as { label: string; href: string; style: 'success' | 'primary' }[];
    return [
      deviceCard(f),
      infoTable('Collection Details', [
        ['Request ID', f.requestId],
        ['Ready On', dv(f.readyDate)],
        ...(storeAddress ? [['Pick up address', storeAddress] as [string, string]] : []),
        ...(collectionHours ? [['Collection hours', collectionHours] as [string, string]] : []),
      ]),
      alertBox(
        'Your device Recycle is complete! Please choose how you would like to receive it using the buttons below.',
        'success',
      ),
      ctaButtons.length ? ctaRow(ctaButtons, cb, t) : '',
      alertBox(
        'After you choose, our team will follow up with collection or courier details.',
        'info',
      ),
    ].join('');
  },

  'quote-ready': (f, cb, t, ov) => {
    const lineItems = parseQuoteLineItems(f);
    const discounts = parseQuoteDiscounts(f);
    const offerAmt = f.finalOffer || f.offerAmount || f.quoteAmount;
    const currency = f.currency || '';
    const subtotal = lineItems.reduce((sum, row) => sum + row.amount, 0);
    const discountTotal = discounts.reduce((sum, row) => sum + row.amount, 0);
    const computedTotal = subtotal - discountTotal;
    const totalNum =
      offerAmt && Number.isFinite(Number(offerAmt)) && Number(offerAmt) > 0
        ? Number(offerAmt)
        : computedTotal;
    const revN = Number(f.quoteGeneration || f.offerGeneration || 0);
    const reviseType = String(f.quoteReviseType ?? '').trim();
    const declineReason = String(f.quoteDeclineReason ?? '').trim();
    const expiryText = f.offerExpiryHours
      ? `This quote is valid for ${f.offerExpiryHours} hours.`
      : 'This quote is valid for 48 hours.';
    const displayAmt = totalNum > 0
      ? formatQuoteMoney(totalNum, currency)
      : '&mdash;';
    const breakdown = quoteBreakdownTable(lineItems, discounts, currency, totalNum);
    const RecycleSummary = String(f.RecycleSummary ?? '').trim();
    const summaryBlock = RecycleSummary
      ? alertBox(
          `<strong style="display:block;margin-bottom:6px;font-size:13px;color:#0f172a;">Work included / Diagnosis summary</strong><span style="font-size:14px;line-height:1.55;color:#334155;">${escapeHtmlEntities(RecycleSummary).replace(/\n/g, '<br/>')}</span>`,
          'info',
        )
      : '';

    let headerCallout = '';
    if (reviseType === 'after_reason' && declineReason) {
      headerCallout = alertBox(
        `<strong style="font-size:14px;">Revised quote after your feedback</strong><br/><span style="font-size:13px;line-height:1.55;">You told us: &ldquo;${escapeHtmlEntities(declineReason)}&rdquo;. Based on that, here is an updated quote.</span>`,
        'info',
      );
    } else if (reviseType === 'final_offer') {
      headerCallout = alertBox(
        `<strong style="font-size:14px;">Our best offer</strong><br/><span style="font-size:13px;line-height:1.55;">We cannot reduce the price further. You can accept this quote to proceed with Recycle, or request return of your device without recycle.</span>`,
        'warning',
      );
    } else if (revN > 1) {
      headerCallout = alertBox(
        `<strong style="font-size:14px;">Revised quote</strong><br/><span style="font-size:13px;line-height:1.5;">This is an updated amount. The buttons below apply only to this version &mdash; earlier links are no longer valid.</span>`,
        'info',
      );
    }

    const paymentNote = reviseType !== 'final_offer'
      ? alertBox(
          'By accepting this quote, we will start the Recycle process. Payment is collected when your device is returned — please choose your preferred payment method on the accept page.',
          'info',
        )
      : alertBox(
          'If you accept, we will start the Recycle and collect payment when your device is returned. If you prefer not to proceed, you can request return of your device as-is.',
          'info',
        );

    const ctaButtons =
      reviseType === 'final_offer'
        ? [
            { label: ov?.customButtonLabel || 'Accept Quote', href: f.acceptUrl || '#', style: 'success' as const },
            { label: 'Return My Device', href: f.returnDeviceUrl || '#', style: 'danger' as const },
          ]
        : [
            { label: ov?.customButtonLabel || 'Accept Quote', href: f.acceptUrl || '#', style: 'success' as const },
            { label: 'Decline', href: f.declineUrl || '#', style: 'danger' as const },
          ];

    const mainBlocks = [
      headerCallout,
      deviceCard(f, displayAmt),
      highlight('Your Quote', displayAmt, expiryText.split('.')[0]),
      breakdown,
      summaryBlock,
      infoTable('Quote Details', [
        ['Request ID',  f.requestId],
        ['Item',        f.deviceName],
        ['Valid Until', f.offerValidUntil || (f.offerExpiryHours ? `${f.offerExpiryHours}h from now` : '&mdash;')],
      ]),
      paymentNote,
      ctaRow(ctaButtons, cb, t),
      alertBox(`${expiryText} Please respond using the buttons above.`, 'warning'),
    ];
    return mainBlocks.filter(Boolean).join('');
  },

  'recycle-in-progress': (f, cb, t) => {
    const estDate = dv(String(f.estimatedCompletionDate ?? '').trim());
    const notes = String(f.RecycleNotes ?? '').trim();
    const preferredPay = String(f.preferredPaymentMethod ?? '').trim();
    const detailRows: [string, string][] = [
      ['Request ID', String(f.requestId ?? '').trim()],
      ['Item', String(f.deviceName ?? '').trim()],
      ['Est. Completion', estDate],
      ...(preferredPay ? [['Payment at return', preferredPay] as [string, string]] : []),
      ...(notes ? [['Notes', notes] as [string, string]] : []),
    ].filter((row): row is [string, string] => String(row[1] ?? '').trim() !== '');

    return [
      highlight('Recycle In Progress', '', 'Work has started on your device'),
      infoTable('recycle Status', detailRows),
      alertBox('Our technicians are working on your device. We will notify you as soon as it is ready for collection or return.', 'success'),
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

  'certificate-issued': (f, cb, t) => {
    const certNo = String(f.certificateNumber ?? '').trim();
    const certDate = dv(String(f.certificateIssuedDate ?? '').trim());
    const certUrl = String(f.certificateUrl ?? '').trim();
    const summary = String(f.actualItemsSummary ?? f.recycleItemsSummary ?? f.deviceName ?? '').trim();
    const actualQty = String(f.actualTotalQty ?? '').trim();
    const rateUrl = String(f.rateUrl ?? f.reviewUrl ?? '').trim();
    const supportUrl = String(f.supportActionUrl ?? '').trim();

    const summaryRows: [string, string][] = [
      ['Request ID', String(f.requestId ?? '').trim()],
      ...(summary ? [['Items recycled', summary] as [string, string]] : []),
      ...(actualQty ? [['Total quantity', actualQty] as [string, string]] : []),
      ...(certNo ? [['Certificate no.', certNo] as [string, string]] : []),
      ...(certDate ? [['Issued on', certDate] as [string, string]] : []),
    ].filter((row): row is [string, string] => String(row[1] ?? '').trim() !== '');

    const certCta =
      certUrl && /^https?:\/\//i.test(certUrl)
        ? ctaRow([{ label: 'Download certificate', href: certUrl, style: 'success' }], cb, t)
        : '';

    const feedbackButtons = [
      rateUrl ? { label: 'Rate our service', href: rateUrl, style: 'primary' as const } : null,
      supportUrl ? { label: 'Contact support', href: supportUrl, style: 'primary' as const } : null,
    ].filter(Boolean) as { label: string; href: string; style: 'primary' }[];

    const closing = String(f.closingMessage ?? f.customMessage ?? '').trim();
    const noteBlock = closing
      ? alertBox(
          `<strong style="display:block;margin-bottom:8px;font-size:13px;color:#0f172a;">A note from our team</strong><span style="font-size:14px;line-height:1.55;color:#334155;">${escapeHtmlEntities(closing).replace(/\n/g, '<br/>')}</span>`,
          'info',
        )
      : '';

    return [
      highlight('Recycling complete', '&#9851;', 'Thank you for recycling responsibly'),
      noteBlock,
      infoTable('Certificate details', summaryRows),
      certCta,
      alertBox(
        'Your e-waste has been processed in line with responsible recycling standards. Keep this certificate for your records — it confirms safe disposal of the items listed above.',
        'success',
      ),
      feedbackButtons.length ? ctaRow(feedbackButtons, cb, t) : '',
    ]
      .filter(Boolean)
      .join('');
  },

  'courier-dispatched': (f, cb, t) => {
    const device = String(f.deviceName ?? '').trim();
    const deliveryAddress = String(f.deliveryAddress ?? '').trim();
    const courier = String(f.courierName ?? '').trim();
    const tracking = String(f.trackingNumber ?? '').trim();
    const trackUrlRaw = String(f.trackingUrl ?? '').trim();
    const trackHref = /^https?:\/\//i.test(trackUrlRaw) ? trackUrlRaw : '';
    const dispatchRows = [
      ['Request ID', String(f.requestId ?? '').trim()],
      ['Item', device],
      ...(deliveryAddress ? [['Delivery address', deliveryAddress] as [string, string]] : []),
      ...(courier ? [['Courier', courier] as [string, string]] : []),
      ...(tracking ? [['Tracking number', tracking] as [string, string]] : []),
    ].filter((row): row is [string, string] => String(row[1] ?? '').trim() !== '');
    const trackCta = trackHref
      ? ctaRow([{ label: 'Track your device', href: trackHref, style: 'primary' }], cb, t)
      : '';
    const footerMsg = trackHref
      ? 'Use the button above to follow your shipment. We will send a completion email once your device is delivered.'
      : 'Our team will contact you if any further delivery details are needed.';
    return [
      highlight('Device Shipped', '&#128230;', 'Your Recycleed device is on the way'),
      alertBox(
        'Your Recycleed device has been dispatched via courier to the address you provided.',
        'info',
      ),
      infoTable('Delivery Details', dispatchRows),
      trackCta,
      alertBox(footerMsg, 'success'),
    ]
      .filter(Boolean)
      .join('');
  },

  'device-return-unrecycled': (f, cb, t) => {
    const device = String(f.deviceName ?? '').trim();
    const returnMethod = String(f.returnMethod ?? 'Courier / pickup as arranged').trim();
    const courier = String(f.courierName ?? '').trim();
    const tracking = String(f.trackingNumber ?? '').trim();
    const trackUrlRaw = String(f.trackingUrl ?? '').trim();
    const trackHref = /^https?:\/\//i.test(trackUrlRaw) ? trackUrlRaw : '';
    const expected = dv(String(f.expectedReturnDate ?? '').trim());
    const returnRows = [
      ['Request ID', String(f.requestId ?? '').trim()],
      ['Item', device],
      ['Return method', returnMethod],
      ...(courier ? [['Courier', courier] as [string, string]] : []),
      ...(tracking ? [['Tracking number', tracking] as [string, string]] : []),
      ...(expected ? [['Expected by', expected] as [string, string]] : []),
    ].filter((row): row is [string, string] => String(row[1] ?? '').trim() !== '');
    const trackCta = trackHref
      ? ctaRow([{ label: 'Track your device', href: trackHref, style: 'primary' }], cb, t)
      : '';
    const footerMsg = trackHref
      ? 'Use the button above to follow your return shipment. Our team will contact you if any further details are needed.'
      : 'Our team will contact you if any further details are needed for delivery or pickup.';
    return [
      highlight('Device Return', '&#128230;', 'Your device will be sent back without recycle'),
      alertBox(
        'You chose not to proceed with the Recycle at our final quoted price. We will return your device in its current condition.',
        'info',
      ),
      infoTable('Return Details', returnRows),
      trackCta,
      alertBox(footerMsg, 'success'),
    ]
      .filter(Boolean)
      .join('');
  },

  'device-return-unrecycled-complete': (f) => {
    const device = String(f.deviceName ?? '').trim();
    const returnedOn = dv(String(f.returnedDate ?? f.completionDate ?? '').trim());
    return [
      highlight('Return Complete', '&#9989;', 'Your device has been returned'),
      alertBox(
        'Your device has been returned without recycle. No Recycle charges apply for this request.',
        'success',
      ),
      infoTable('Summary', [
        ['Request ID', String(f.requestId ?? '').trim()],
        ['Item', device],
        ...(returnedOn ? [['Returned On', returnedOn] as [string, string]] : []),
      ]),
      alertBox('Thank you for considering Rekart. Reach out anytime if you need help in the future.', 'info'),
    ].join('');
  },
};

// ?? Reminder workflow entries (reuse base builders + prepend banner) ??????????
(WORKFLOW_CONTENT as Record<string, WorkflowBuilderFn>)['recycle-request-reminder'] =
  (f, cb, t, ov) =>
    reminderBanner(REMINDER_MESSAGES['recycle-request-reminder'], f) +
    (WORKFLOW_CONTENT['recycle-request']!(f, cb, t, ov));

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
  'recycle-request-reminder':
    "We haven't heard back about your e-waste pickup request yet. Please confirm pickup (or decline) using the button below so we can schedule collection.",
  'pickup-scheduled-reminder':
    "Reminder: your recycling pickup is coming up. Please keep the listed items ready and accessible at the pickup address below.",
};

// ?? Step display names ????????????????????????????????????????????????????????
const STEP_NAMES: Record<string, string> = {
  'recycle-request':          'Recycle Request',
  'recycle-request-reminder': 'Recycle Request',
  'pickup-scheduled':          'Pickup Scheduled',
  'pickup-scheduled-reminder': 'Pickup Scheduled',
  'devices-collected':       'Devices Collected',
  'certificate-issued':             'Certificate Issued',
};

const GREETINGS: Record<string, (f: FieldData) => string> = {
  'recycle-request':          (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'recycle-request-reminder': (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'pickup-scheduled':          (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'pickup-scheduled-reminder': (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'devices-collected':       (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
  'certificate-issued':             (f) => `Hello${f.customerName ? `, ${f.customerName}` : ''},`,
};

const BODY_TEXT: Record<string, (f: FieldData) => string> = {
  'recycle-request': () =>
    `Thank you for choosing Rekart to recycle your e-waste. Please review the items below and confirm pickup so we can schedule collection.`,

  'pickup-scheduled': () =>
    `Your recycling pickup is confirmed. Our collection agent will arrive in the window below — please keep items ready at the pickup address.`,

  'devices-collected': () =>
    `We've collected your items and logged them for responsible recycling. Your certificate will follow once processing is complete.`,

  'recycle-request-reminder': () =>
    `A gentle reminder — your recycling request is waiting for confirmation. Tap the button below to choose pickup date, time, and address.`,

  'pickup-scheduled-reminder': (f) => {
    const slot = pickupTimeDisplay(f);
    const day  = dv(f.pickupDate) || 'the scheduled date';
    return `Reminder: pickup on ${day}${slot ? ` (${slot})` : ''}. Please ensure items are accessible at the address below.`;
  },

  'certificate-issued': () =>
    `Recycling is complete. Your certificate is below — thank you for disposing of e-waste responsibly with Rekart.`,
};

// ?? Main render function ??????????????????????????????????????????????????????
export function renderRecycleEmailHtml(
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

  const stepName  = STEP_NAMES[workflowKey] ?? workflowKey;
  const contentFn = WORKFLOW_CONTENT[workflowKey] ?? WORKFLOW_CONTENT['certificate-issued'];
  const greetingFn = GREETINGS[workflowKey] ?? ((ff: FieldData) => `Hi ${ff.customerName || 'there'},`);
  const bodyFn     = BODY_TEXT[workflowKey] ?? (() => 'Please review the details below.');

  const mainBlocks  = contentFn(f, opts.tracking?.clickBaseUrl, tokens, ov);
  const customBlock = customMessageCallout(f);
  const contentBlocks = `${customBlock}${mainBlocks}`;

  const heroHeadline    = HERO_HEADLINES[workflowKey] ?? stepName;
  const stepProgressBlock = stepProgressHtml(workflowKey, REKART_TOP_BAR, f);
  const mascotMeta        = workflowMascotMeta(workflowKey);

  const greeting = ov.customGreetingText || greetingFn(f);
  void greeting;

  const { tracking, ...optsForKey } = opts;
  const key = cacheKey(workflowKey, dynamicValues, optsForKey as Record<string, unknown>);
  let inlined = cacheGet(key);

  if (!inlined) {
    inlined = renderRekartEmailShell({
      journeyLabel: 'Recycle Journey',
      subject: opts.subject ?? stepName,
      stepBadge: stepName.toUpperCase(),
      heroHeadline,
      bodyText: bodyFn(f),
      contentBlocks,
      stepProgressHtml: stepProgressBlock,
      mascotSrc: opts.mascotSrc,
      mascotAlt: mascotMeta?.alt ?? 'Rekart mascot',
      workspaceName: opts.workspaceName,
      logoUrl: opts.logoUrl,
      designTokens: tokens,
      footer: opts.footer,
      perEmailOverrides: ov,
      compliance: opts.compliance,
      socialIconSrcs: opts.socialIconSrcs,
    });
    cacheSet(key, inlined);
  }

  if (tracking?.trackingPixelUrl) {
    const pixel = `<img src="${tracking.trackingPixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;" />`;
    return inlined.replace('</body>', `${pixel}\n</body>`);
  }

  return inlined;
}

export interface RekartEmailShellOptions {
  journeyLabel: string;
  subject: string;
  stepBadge: string;
  heroHeadline: string;
  bodyText: string;
  contentBlocks: string;
  stepProgressHtml?: string;
  mascotSrc?: string;
  mascotAlt?: string;
  workspaceName?: string;
  logoUrl?: string;
  designTokens?: Partial<DesignTokens>;
  footer?: FooterOptions;
  perEmailOverrides?: PerEmailOverrides;
  tracking?: TrackingOptions;
  compliance?: ComplianceOptions;
  socialIconSrcs?: Record<string, string>;
}

/** Shared Rekart email shell — top bar, hero, footer services, signoff, compliance strip. */
export function renderRekartEmailShell(opts: RekartEmailShellOptions): string {
  const tokens: DesignTokens = {
    ...DEFAULT_DESIGN_TOKENS,
    ...(opts.designTokens ?? {}),
  };
  const ov: PerEmailOverrides = { ...(opts.perEmailOverrides ?? {}) };
  const fo = opts.footer ?? {};
  const workspaceName = opts.workspaceName ?? 'Rekart';
  const signoffName = ov.customSignoffName || fo.teamDisplayName || `${workspaceName} Team`;
  const footerGreeting = tokens.footerGreetingText || 'Warm regards,';
  const footerNote = ov.customFooterNote || fo.customFooterNote || tokens.footerNote || '';
  const copyrightLine = tokens.copyrightText || `\u00a9 ${new Date().getFullYear()} ${workspaceName}`;
  const privacyPolicyUrl = fo.privacyPolicyUrl || '';
  const termsOfServiceUrl = fo.termsOfServiceUrl || '';
  const supportUrl = fo.supportUrl || '';
  const hasFooterLinks = !!(privacyPolicyUrl || termsOfServiceUrl || supportUrl);
  const showPrivacyDot = !!(privacyPolicyUrl && (termsOfServiceUrl || supportUrl));
  const showTermsDot = !!(termsOfServiceUrl && supportUrl);

  const complianceColors = resolveComplianceStripColors(
    tokens,
    opts.compliance?.complianceBgColor,
    opts.compliance?.complianceTextColor,
  );

  const emailCss = injectComplianceStripStyles(
    buildEmailCss(tokens, {
      headingColor: ov.customHeadingColor || undefined,
      bodyTextColor: ov.customBodyTextColor || undefined,
    }),
    complianceColors,
  );

  const fontImport = buildFontImport(tokens.headingFontFamily, tokens.bodyFontFamily);
  const complianceBlock = buildComplianceBlock(opts.compliance, privacyPolicyUrl);

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

  const heroMascotBlock = heroMascotHtml(opts.mascotSrc ?? '', opts.mascotAlt ?? 'Rekart mascot');
  const companyAddressHtml = footerAddressHtml(resolveFooterAddress(fo.companyAddress));

  const rawHtml = BASE_SHELL({
    journeyLabel: opts.journeyLabel,
    subject: opts.subject,
    stepBadge: opts.stepBadge,
    heroHeadline: opts.heroHeadline,
    bodyText: opts.bodyText,
    contentBlocks: opts.contentBlocks,
    stepProgressHtml: opts.stepProgressHtml ?? '',
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
    supportPhone: fo.supportPhone || '',
    website: fo.website || '',
    privacyPolicyUrl,
    termsOfServiceUrl,
    supportUrl,
    hasFooterLinks,
    showPrivacyDot,
    showTermsDot,
    socialLinksHtml,
    copyrightLine,
  });

  let inlined = juice(rawHtml, {
    removeStyleTags: false,
    applyStyleTags: true,
    applyAttributesTableElements: true,
    preserveMediaQueries: true,
    preserveFontFaces: true,
  });

  if (opts.tracking?.trackingPixelUrl) {
    const pixel = `<img src="${opts.tracking.trackingPixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;" />`;
    inlined = inlined.replace('</body>', `${pixel}\n</body>`);
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
