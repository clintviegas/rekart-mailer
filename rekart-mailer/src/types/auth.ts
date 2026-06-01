export type UserRole = "OWNER" | "ADMIN" | "EDITOR" | "SENDER" | "ANALYST" | "VIEWER";
export type UserStatus = "ACTIVE" | "INACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED";
export type WorkspacePlan = "FREE" | "STARTER" | "PRO" | "ENTERPRISE";
export type WorkspaceStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED";

export interface User {
  _id: string;
  fullName: string;
  email: string;
  avatar: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  workspaceId: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  _id: string;
  name: string;
  slug: string;
  plan: WorkspacePlan;
  status: WorkspaceStatus;
  ownerId: string;
  emailsSentThisMonth: number;
  subscribersCount: number;
  planLimits: {
    emailsPerMonth: number;
    subscribers: number;
    teamMembers: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthState {
  user: User | null;
  workspace: Workspace | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupPayload {
  fullName: string;
  email: string;
  password: string;
  companyName: string;
}
