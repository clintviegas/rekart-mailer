export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  workspaceId: string;
  iat?: number;
  exp?: number;
}
