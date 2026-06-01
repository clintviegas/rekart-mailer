# Rekart Mailer Backend

**Production-grade NestJS API** for a multi-tenant SaaS email automation platform.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| Language | TypeScript (strict) |
| Database | MongoDB via Mongoose |
| Cache / Queue | Redis + BullMQ |
| Auth | JWT (access + refresh) + Passport |
| Password | bcrypt |
| Validation | class-validator + class-transformer |
| Config | @nestjs/config + Joi schema validation |
| Security | Helmet + CORS + Rate Limiting (Throttler) |

## API Endpoints

### Auth (public)
```
POST /api/v1/auth/signup          → Create account + workspace
POST /api/v1/auth/login           → Login, receive tokens
POST /api/v1/auth/refresh         → Rotate refresh token
POST /api/v1/auth/forgot-password → Send password reset link
POST /api/v1/auth/reset-password  → Reset with token
```

### Auth (authenticated)
```
POST /api/v1/auth/logout   → Revoke refresh token(s)
```

### Users (authenticated)
```
GET /api/v1/users/me       → Get current user profile
```

### Workspace (authenticated)
```
GET /api/v1/workspace/current → Get current workspace
```

## Getting Started

```bash
# Install dependencies
npm install

# Copy env
cp .env.example .env

# Edit .env with your secrets (MongoDB URI, JWT secrets, etc.)

# Development
npm run start:dev

# Production build
npm run build
npm run start:prod
```

## Project Structure

```
src/
  app.module.ts              ← Root module (wires everything)
  main.ts                    ← Bootstrap (Helmet, CORS, global pipe)
  config/
    app.config.ts            ← Typed config namespaces
    env.validation.ts        ← Joi env schema validation
  database/
    database.module.ts       ← Mongoose async factory
  providers/
    redis.module.ts          ← Global Redis module
    redis.provider.ts        ← ioredis client provider
  common/
    decorators/              ← @CurrentUser, @Public, @Roles
    filters/                 ← AllExceptionsFilter
    guards/                  ← JwtAuthGuard, RolesGuard
    interceptors/            ← ResponseInterceptor, LoggingInterceptor
    utils/                   ← enums, api-response, slug, crypto
  modules/
    auth/
      dto/                   ← SignupDto, LoginDto, etc.
      strategies/            ← JwtStrategy (Passport)
      schemas/               ← RefreshToken schema
      auth.service.ts        ← Core auth logic
      auth.controller.ts     ← Route handlers
      auth.module.ts
    users/
      schemas/user.schema.ts ← User Mongoose schema
      users.service.ts
      users.controller.ts
      users.module.ts
    workspace/
      schemas/               ← Workspace Mongoose schema
      workspace.service.ts
      workspace.controller.ts
      workspace.module.ts
    campaigns/               ← (stub, ready to expand)
    templates/               ← (stub, ready to expand)
    analytics/               ← (stub, ready to expand)
    settings/                ← (stub, ready to expand)
  jobs/                      ← (BullMQ job processors, ready to expand)
```

## Security Architecture

- **JWT Access Token**: 15 min TTL, stateless validation
- **JWT Refresh Token**: 7 day TTL, stored hashed in MongoDB, rotated on use
- **Password Reset Token**: SHA-256 hashed, TTL-indexed, single use
- **Soft Deletes**: Users have `isDeleted` flag, pre-hooks filter queries
- **Global JWT Guard**: All routes protected by default; use `@Public()` to opt out
- **Role Guard**: Use `@Roles(UserRole.OWNER)` decorator on any route
- **Helmet**: HTTP security headers
- **Rate Limiting**: 100 req/60s per IP (configurable via env)
- **Input Validation**: whitelist + forbidNonWhitelisted on all DTOs

## User Roles

```typescript
OWNER    → Full access, workspace owner
ADMIN    → Full access except billing/ownership
EDITOR   → Can create/edit campaigns and templates
SENDER   → Can send campaigns
ANALYST  → Read-only analytics access
VIEWER   → Read-only access
```

## Multi-Tenant Architecture

On signup, the system automatically:
1. Creates a `Workspace` with a unique slug (from `companyName`)
2. Creates the `User` as `OWNER` role
3. Links `User.workspaceId → Workspace._id`
4. All future requests carry `workspaceId` in the JWT payload
5. Data is always scoped to `workspaceId`
