import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WorkspaceBranding,
  WorkspaceBrandingDocument,
} from './schemas/workspace-branding.schema';

@Injectable()
export class WorkspaceBrandingService {
  constructor(
    @InjectModel(WorkspaceBranding.name)
    private readonly model: Model<WorkspaceBrandingDocument>,
  ) {}

  async getRaw(workspaceId: string): Promise<WorkspaceBranding | null> {
    return this.model
      .findOne({ workspaceId: new Types.ObjectId(workspaceId) })
      .lean();
  }

  async upsert(
    workspaceId: string,
    data: Partial<WorkspaceBranding>,
  ): Promise<WorkspaceBranding> {
    return this.model
      .findOneAndUpdate(
        { workspaceId: new Types.ObjectId(workspaceId) },
        { $set: data },
        { upsert: true, new: true },
      )
      .lean() as Promise<WorkspaceBranding>;
  }
}
