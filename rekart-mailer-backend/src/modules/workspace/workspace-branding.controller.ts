import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  OnModuleInit,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { WorkspaceBrandingService } from './workspace-branding.service';
import { createResponse } from '../../common/utils/api-response';

const LOGOS_DIR = path.join(process.cwd(), 'uploads', 'logos');
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

/** Resolve a saved branding logo URL to an absolute path under LOGOS_DIR, or null. */
function diskPathFromStoredLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl?.trim()) return null;
  const m = String(logoUrl).match(/uploads[/\\]logos[/\\]([^?#]+)/i);
  if (!m?.[1]) return null;
  const name = path.basename(decodeURIComponent(m[1]));
  if (!name || name === '.' || name === '..') return null;
  const full = path.join(LOGOS_DIR, name);
  const logosResolved = path.resolve(LOGOS_DIR);
  const targetResolved = path.resolve(full);
  if (
    targetResolved !== logosResolved &&
    !targetResolved.startsWith(logosResolved + path.sep)
  ) {
    return null;
  }
  return targetResolved;
}

function unlinkStoredLogoIfExists(logoUrl: string | null | undefined): void {
  const p = diskPathFromStoredLogoUrl(logoUrl);
  if (p && fs.existsSync(p)) {
    fs.unlink(p, () => undefined);
  }
}

const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
]);

@Controller('workspace/branding')
@UseGuards(JwtAuthGuard)
export class WorkspaceBrandingController implements OnModuleInit {
  constructor(private readonly brandingService: WorkspaceBrandingService) {}

  onModuleInit() {
    // Ensure the logos upload directory exists when the module initialises
    if (!fs.existsSync(LOGOS_DIR)) {
      fs.mkdirSync(LOGOS_DIR, { recursive: true });
    }
  }

  @Get()
  async getBranding(@CurrentUser() user: JwtPayload) {
    const branding = await this.brandingService.getRaw(user.workspaceId);
    return createResponse(branding ?? {}, 'Branding fetched');
  }

  @Put()
  async updateBranding(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, unknown>,
  ) {
    const updated = await this.brandingService.upsert(user.workspaceId, body);
    return createResponse(updated, 'Branding updated');
  }

  /** POST /api/v1/workspace/branding/logo — upload company logo */
  @Post('/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          // Re-ensure directory exists right before writing
          if (!fs.existsSync(LOGOS_DIR)) {
            fs.mkdirSync(LOGOS_DIR, { recursive: true });
          }
          cb(null, LOGOS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase() || '.png';
          cb(null, `logo-${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_SIZE },
    }),
  )
  async uploadLogo(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Send a file with field name "logo".');
    }

    // Manual MIME check — more reliable than FileTypeValidator for all image types
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      fs.unlink(file.path, () => undefined); // clean up the already-saved file
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Allowed: PNG, JPG, SVG, WEBP.`,
      );
    }

    if (file.size > MAX_SIZE) {
      fs.unlink(file.path, () => undefined);
      throw new BadRequestException('File exceeds 2 MB limit.');
    }

    const existing = await this.brandingService.getRaw(user.workspaceId);
    const prevUrl = existing?.logoUrl as string | undefined;

    let finalFilename = file.filename;
    let finalAbs = file.path;

    if (file.mimetype === 'image/svg+xml') {
      finalFilename = file.filename.replace(/\.svg$/i, '.png');
      if (!finalFilename.toLowerCase().endsWith('.png')) {
        finalFilename = `logo-${Date.now()}.png`;
      }
      finalAbs = path.join(LOGOS_DIR, finalFilename);
      try {
        await sharp(file.path)
          .resize({ width: 560, height: 240, fit: 'inside', withoutEnlargement: true })
          .png({ quality: 92 })
          .toFile(finalAbs);
      } catch {
        await fs.promises.unlink(file.path).catch(() => undefined);
        throw new BadRequestException(
          'Could not process SVG logo. Try uploading PNG or JPEG instead.',
        );
      }
      await fs.promises.unlink(file.path).catch(() => undefined);
    }

    const backendBase = (process.env.BACKEND_BASE_URL ?? 'http://localhost:8000').replace(
      /\/$/,
      '',
    );
    const logoUrl = `${backendBase}/uploads/logos/${finalFilename}`;

    const updated = await this.brandingService.upsert(user.workspaceId, {
      logoUrl,
    });

    const prevPath = diskPathFromStoredLogoUrl(prevUrl);
    const newPath = path.resolve(finalAbs);
    if (prevPath && prevPath !== newPath) {
      unlinkStoredLogoIfExists(prevUrl);
    }

    return createResponse({ logoUrl, branding: updated }, 'Logo uploaded');
  }

  /** DELETE /api/v1/workspace/branding/logo — remove company logo */
  @Delete('/logo')
  async removeLogo(@CurrentUser() user: JwtPayload) {
    const existing = await this.brandingService.getRaw(user.workspaceId);

    if (existing?.logoUrl) {
      unlinkStoredLogoIfExists(existing.logoUrl as string);
    }

    await this.brandingService.upsert(user.workspaceId, { logoUrl: '' });
    return createResponse(null, 'Logo removed');
  }
}
