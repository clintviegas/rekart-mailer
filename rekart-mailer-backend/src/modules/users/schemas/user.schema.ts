import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model, Query, Types } from 'mongoose';
import { UserRole, UserStatus } from '../../../common/utils/enums';

export type UserDocument = User & Document;

@Schema({
  timestamps: true,
  collection: 'users',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret['password'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class User {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ required: true, ref: 'Workspace', index: true })
  workspaceId: Types.ObjectId;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.OWNER,
  })
  role: UserRole;

  @Prop({
    type: String,
    enum: UserStatus,
    default: UserStatus.PENDING_VERIFICATION,
  })
  status: UserStatus;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ type: String, default: null })
  avatar: string | null;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;

  @Prop({ default: false, select: false })
  isDeleted: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ workspaceId: 1 });
UserSchema.index({ workspaceId: 1, role: 1 });

type UserQuery = Query<unknown, UserDocument> & { model?: Model<UserDocument> };

UserSchema.pre<UserQuery>('find', function () {
  void this.where({ isDeleted: false });
});

UserSchema.pre<UserQuery>('findOne', function () {
  void this.where({ isDeleted: false });
});
