import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Workspace, WorkspaceDocument } from './schemas/workspace.schema';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { createResponse } from '../../common/utils/api-response';
import { WorkspaceBrandingService } from './workspace-branding.service';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,

    private readonly brandingService: WorkspaceBrandingService,
  ) {}

  async getCurrent(currentUser: JwtPayload) {
    const [workspace, branding] = await Promise.all([
      this.workspaceModel.findById(currentUser.workspaceId).lean(),
      this.brandingService.getRaw(currentUser.workspaceId),
    ]);

    if (!workspace) throw new NotFoundException('Workspace not found');

    return createResponse(
      {
        ...workspace,
        companyLogoUrl: branding?.logoUrl || null,
        branding: branding ?? null,
      },
      'Workspace fetched successfully',
    );
  }

  async findById(id: string) {
    return this.workspaceModel.findById(id).lean();
  }

  async findBySlug(slug: string) {
    return this.workspaceModel.findOne({ slug }).lean();
  }
}
