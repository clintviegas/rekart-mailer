import {
  BadRequestException,
  Controller,
  Delete,
  OnModuleInit,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { createResponse } from '../../common/utils/api-response';

const ATTACHMENTS_DIR = path.join(process.cwd(), 'uploads', 'recycle-attachments');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 10;

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
]);

export interface AttachmentInfo {
  storedFilename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

@Controller('recycle/attachments')
@UseGuards(JwtAuthGuard)
export class RecycleAttachmentController implements OnModuleInit {
  onModuleInit() {
    if (!fs.existsSync(ATTACHMENTS_DIR)) {
      fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
    }
  }

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!fs.existsSync(ATTACHMENTS_DIR)) {
            fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
          }
          cb(null, ATTACHMENTS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname);
          const base = path
            .basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .slice(0, 50);
          cb(null, `${Date.now()}_${base}${ext}`);
        },
      }),
    }),
  )
  async uploadAttachments(
    @CurrentUser() _user: JwtPayload,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const rejected: string[] = [];
    const accepted: AttachmentInfo[] = [];

    for (const file of files) {
      // Validate MIME type
      if (!ALLOWED_MIMES.has(file.mimetype)) {
        fs.unlink(file.path, () => undefined);
        rejected.push(`${file.originalname}: unsupported file type`);
        continue;
      }
      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        fs.unlink(file.path, () => undefined);
        rejected.push(`${file.originalname}: exceeds 10 MB limit`);
        continue;
      }

      const backendBase = process.env.BACKEND_BASE_URL ?? 'http://localhost:8000';
      accepted.push({
        storedFilename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `${backendBase}/uploads/recycle-attachments/${file.filename}`,
      });
    }

    return createResponse(
      { accepted, rejected },
      `${accepted.length} file(s) uploaded${rejected.length ? `, ${rejected.length} rejected` : ''}`,
    );
  }

  /** Remove a previously uploaded attachment file from disk */
  @Delete(':filename')
  async deleteAttachment(
    @CurrentUser() _user: JwtPayload,
    @Param('filename') filename: string,
  ) {
    // Sanitize — no path traversal
    const safe = path.basename(filename);
    const filePath = path.join(ATTACHMENTS_DIR, safe);

    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, () => undefined);
    }

    return createResponse(null, 'Attachment removed');
  }
}
