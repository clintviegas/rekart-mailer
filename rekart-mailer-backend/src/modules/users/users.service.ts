import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { createResponse } from '../../common/utils/api-response';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getMe(currentUser: JwtPayload) {
    const user = await this.userModel
      .findById(currentUser.sub)
      .populate('workspaceId', 'name slug plan status')
      .lean();

    if (!user) throw new NotFoundException('User not found');

    return createResponse(user, 'User fetched successfully');
  }

  async findById(id: string) {
    return this.userModel.findById(id).lean();
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).lean();
  }
}
