import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Workspace, WorkspaceDocument } from '../workspace/schemas/workspace.schema';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UserRole, UserStatus } from '../../common/utils/enums';
import { generateUniqueSlug } from '../../common/utils/slug.util';
import { generateSecureToken, hashToken } from '../../common/utils/crypto.util';
import { createResponse } from '../../common/utils/api-response';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signup(dto: SignupDto, req: Request) {
    const existingUser = await this.userModel
      .findOne({ email: dto.email })
      .select('_id')
      .lean();

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const slug = generateUniqueSlug(dto.companyName);
    const bcryptRounds = this.config.get<number>('security.bcryptRounds') ?? 12;
    const passwordHash = await bcrypt.hash(dto.password, bcryptRounds);

    // Pre-generate userId so workspace.ownerId can be set on first save
    const userId = new Types.ObjectId();
    const workspaceId = new Types.ObjectId();

    const workspace = await this.workspaceModel.create({
      _id: workspaceId,
      name: dto.companyName,
      slug,
      ownerId: userId,
    });

    const user = await this.userModel.create({
      _id: userId,
      fullName: dto.fullName,
      email: dto.email,
      password: passwordHash,
      workspaceId: workspace._id,
      role: UserRole.OWNER,
      status: UserStatus.PENDING_VERIFICATION,
    });

    this.logger.log(
      `New signup: ${user.email} — workspace: ${workspace.slug} (${workspace._id})`,
    );

    const tokens = await this.generateTokens(user, req);

    const safeUser = await this.userModel.findById(user._id).lean();

    return createResponse(
      { user: safeUser, ...tokens },
      'Account created successfully',
    );
  }

  async login(dto: LoginDto, req: Request) {
    const user = await this.userModel
      .findOne({ email: dto.email })
      .select('+password')
      .lean();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.userModel.findByIdAndUpdate(user._id, {
      lastLoginAt: new Date(),
    });

    const tokens = await this.generateTokens(user, req);

    const { password: _pw, ...safeUser } = user;

    return createResponse(
      { user: safeUser, ...tokens },
      'Login successful',
    );
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await this.refreshTokenModel.findOneAndUpdate(
        { userId: new Types.ObjectId(userId), tokenHash },
        { revoked: true },
      );
    } else {
      await this.refreshTokenModel.updateMany(
        { userId: new Types.ObjectId(userId), revoked: false },
        { revoked: true },
      );
    }

    return createResponse(null, 'Logged out successfully');
  }

  async refreshTokens(rawRefreshToken: string, req: Request) {
    const tokenHash = hashToken(rawRefreshToken);

    const storedToken = await this.refreshTokenModel
      .findOne({ tokenHash, revoked: false })
      .lean();

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }

    if (new Date() > storedToken.expiresAt) {
      await this.refreshTokenModel.findByIdAndUpdate(storedToken._id, {
        revoked: true,
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(rawRefreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      await this.refreshTokenModel.findByIdAndUpdate(storedToken._id, {
        revoked: true,
      });
      throw new UnauthorizedException('Refresh token verification failed');
    }

    const user = await this.userModel
      .findById(payload.sub)
      .select('+password')
      .lean();

    if (!user) throw new UnauthorizedException('User not found');

    await this.refreshTokenModel.findByIdAndUpdate(storedToken._id, {
      revoked: true,
    });

    const tokens = await this.generateTokens(user, req);

    return createResponse(tokens, 'Tokens refreshed');
  }

  async forgotPassword(email: string) {
    const user = await this.userModel
      .findOne({ email })
      .select('_id email')
      .lean();

    if (!user) {
      return createResponse(
        null,
        'If this email exists, a reset link has been sent',
      );
    }

    const resetToken = generateSecureToken(32);
    const tokenHash = hashToken(resetToken);
    const expiresIn = this.config.get<number>('security.resetTokenExpiresIn') ?? 3600;

    await this.refreshTokenModel.create({
      userId: user._id,
      tokenHash: `reset:${tokenHash}`,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    });

    this.logger.log(
      `Password reset requested for ${email}. Token (dev only): ${resetToken}`,
    );

    return createResponse(
      null,
      'If this email exists, a reset link has been sent',
    );
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = `reset:${hashToken(dto.token)}`;

    const storedToken = await this.refreshTokenModel
      .findOne({ tokenHash, revoked: false })
      .lean();

    if (!storedToken || new Date() > storedToken.expiresAt) {
      throw new BadRequestException('Reset token is invalid or expired');
    }

    const bcryptRounds = this.config.get<number>('security.bcryptRounds') ?? 12;
    const passwordHash = await bcrypt.hash(dto.password, bcryptRounds);

    await this.userModel.findByIdAndUpdate(storedToken.userId, {
      password: passwordHash,
    });

    await this.refreshTokenModel.findByIdAndUpdate(storedToken._id, {
      revoked: true,
    });

    await this.refreshTokenModel.updateMany(
      { userId: storedToken.userId, revoked: false },
      { revoked: true },
    );

    return createResponse(null, 'Password reset successfully');
  }

  private async generateTokens(
    user: { _id: Types.ObjectId | string; email: string; role: string; workspaceId: Types.ObjectId | string },
    req: Request,
  ) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId.toString(),
    };

    const accessOptions: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: this.config.getOrThrow<string>('jwt.accessExpiresIn') as JwtSignOptions['expiresIn'],
    };

    const refreshOptions: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      expiresIn: this.config.getOrThrow<string>('jwt.refreshExpiresIn') as JwtSignOptions['expiresIn'],
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, accessOptions),
      this.jwtService.signAsync(payload, refreshOptions),
    ]);

    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn') ?? '7d';
    const days = parseInt(refreshExpiresIn.replace('d', ''), 10) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const tokenHash = hashToken(refreshToken);

    await this.refreshTokenModel.create({
      userId: user._id instanceof Types.ObjectId ? user._id : new Types.ObjectId(user._id.toString()),
      tokenHash,
      expiresAt,
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: (req.ip ?? req.socket?.remoteAddress) ?? null,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
    };
  }
}
